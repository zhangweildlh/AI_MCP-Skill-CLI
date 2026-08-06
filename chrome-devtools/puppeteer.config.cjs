/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  chrome: {
    // 源码层固定为 true：确保任何不经过包装脚本（deploy/upstream 的 PUPPETEER_SKIP_DOWNLOAD=1）
    // 的 npm install / npm ci / IDE 自动安装路径都不会下载 Chrome 内核（~150MB），守住"零下载"红线。
    // 包装脚本的 env 兜底仍保留作为纵深防御。
    skipDownload: true,
  },
  ['chrome-headless-shell']: {
    skipDownload: true,
  },
  firefox: {
    skipDownload: true,
  },
};
