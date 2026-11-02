#!/usr/bin/env python3
"""跨引擎参考解析器（独立实现，仅用 Python 标准库）。
用于对 search_wechat.js 的 Node 解析器做交叉验证：两者对同一份搜狗 HTML
独立解析，比对 title/url/summary/source 是否一致。不依赖任何第三方包。
"""
import sys
import re
import json


def _strip(html):
    html = re.sub(r'<script[\s\S]*?</script>', '', html, flags=re.I)
    html = re.sub(r'<style[\s\S]*?</style>', '', html, flags=re.I)
    html = re.sub(r'<[^>]+>', '', html)
    return re.sub(r'\s+', ' ', html).strip()


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
    html = open(sys.argv[1], encoding='utf-8').read()
    print(json.dumps(parse(html), ensure_ascii=False))
