#!/usr/bin/env python3
"""跨引擎参考解析器（独立实现，仅用 Python 标准库）。
用于对 search_wechat.js 的 Node 解析器做交叉验证：两者对同一份搜狗 HTML
独立解析，比对 article 字段与 isAntiSpider 判定是否一致。不依赖任何第三方包。

参考实现必须与被测实现语义等价，否则交叉验证本身不可信：
  - 实体解码：与 Node 端 htmlToText 保持同样的替换顺序与命名实体表；
  - isAntiSpider：与 Node 端判定逻辑保持同样的优先级与标记集合。
"""
import sys
import re
import json

# 与 Node 端 search_wechat.js 的 NAMED_ENTITIES 对齐
NAMED_ENTITIES = {
    'ldquo': '\u201c', 'rdquo': '\u201d', 'lsquo': '\u2018', 'rsquo': '\u2019',
    'hellip': '\u2026', 'mdash': '\u2014', 'ndash': '\u2013', 'middot': '\u00b7',
}

# 与 Node 端 search_wechat.js 的 LEGIT_EMPTY_MARKERS 对齐
LEGIT_EMPTY_MARKERS = [
    '没有找到相关的微信公众号文章',
    'no-result',
]


def _safe_chr(code):
    """按码点转字符，非法码点原样返回（对齐 Node 的 fromCodePoint 语义且不抛异常）。"""
    try:
        if code < 0 or code > 0x10FFFF:
            return ''
        return chr(code)
    except (ValueError, OverflowError):
        return ''


def _decode_entities(text):
    """按 Node 端 htmlToText 的顺序解码实体（先字面量替换，再命名实体，再数字实体）。"""
    text = (text.replace('&nbsp;', ' ')
                .replace('&amp;', '&')
                .replace('&lt;', '<')
                .replace('&gt;', '>')
                .replace('&quot;', '"')
                .replace('&#39;', "'"))
    text = re.sub(r'&([a-zA-Z]+);',
                  lambda m: NAMED_ENTITIES.get(m.group(1), m.group(0)), text)
    text = re.sub(r'&#(\d+);',
                  lambda m: _safe_chr(int(m.group(1))), text)
    text = re.sub(r'&#x([0-9a-fA-F]+);',
                  lambda m: _safe_chr(int(m.group(1), 16)), text)
    return text


def _strip(html):
    html = re.sub(r'<script[\s\S]*?</script>', '', html, flags=re.I)
    html = re.sub(r'<style[\s\S]*?</style>', '', html, flags=re.I)
    html = re.sub(r'<[^>]+>', '', html)
    # 实体解码须在空白归一之前（与 Node 端顺序一致）
    html = _decode_entities(html)
    return re.sub(r'\s+', ' ', html).strip()


def is_anti_spider(html):
    """与 Node 端 search_wechat.js 的 isAntiSpider 保持等价语义。"""
    if not html:
        return True
    if 'antispider' in html:
        return True
    if 'news-list' in html:
        return False
    if any(m in html for m in LEGIT_EMPTY_MARKERS):
        return False
    return len(html) < 1000


def parse(html):
    m = re.search(r'<ul[^>]*class=["\'][^"\']*news-list[^"\']*["\'][^>]*>(.*?)</ul>', html, re.S)
    if not m:
        return []
    block = m.group(1)
    lis = re.findall(r'<li[^>]*>(.*?)</li>', block, re.S)
    arts = []
    for li in lis:
        # title + url from first <h3><a>
        title = url = ''
        h3 = re.search(r'<h3[^>]*>(.*?)</h3>', li, re.S)
        if h3:
            a = re.search(r'<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', h3.group(1), re.S)
            if a:
                url = a.group(1)
                title = _strip(a.group(2))
        # summary from <p class="txt-info">
        p = re.search(r'<p[^>]*class=["\'][^"\']*txt-info[^"\']*["\'][^>]*>(.*?)</p>', li, re.S)
        summary = _strip(p.group(1)) if p else ''
        # source: <span class="all-time-y2"> or <a class="account">
        src = ''
        s2 = re.search(r'<span[^>]*class=["\'][^"\']*all-time-y2[^"\']*["\'][^>]*>(.*?)</span>', li, re.S)
        if s2:
            src = _strip(s2.group(1))
        else:
            acc = re.search(r'<a[^>]*class=["\'][^"\']*account[^"\']*["\'][^>]*>(.*?)</a>', li, re.S)
            if acc:
                src = _strip(acc.group(1))
        if url.startswith('/'):
            url = 'https://weixin.sogou.com' + url
        arts.append({'title': title, 'url': url, 'summary': summary, 'source': src})
    return arts


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write('用法: ref_parser.py <html文件路径>\n')
        sys.exit(2)
    html = open(sys.argv[1], encoding='utf-8').read()
    print(json.dumps({
        'articles': parse(html),
        'is_anti_spider': is_anti_spider(html),
    }, ensure_ascii=False))
