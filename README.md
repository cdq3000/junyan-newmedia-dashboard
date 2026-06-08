# 骏延集团新媒体数据管理系统

## 页面入口

前台大屏：

```text
https://cdq3000.github.io/junyan-newmedia-dashboard/
```

数据管理后台：

```text
https://cdq3000.github.io/junyan-newmedia-dashboard/admin.html
```

管理口令：

```text
JUNYAN-2026
```

## 后台能做什么

- 新增月份
- 新增、重命名、删除门店
- 编辑直播场次、短视频发布、总线索量、邀约到店、新媒体订单、新媒体订单占零售占比
- 直接导入 `.xlsx/.xls` 月度 Excel 表，或导入/导出 `dashboard-data.json`
- 使用 GitHub token 发布数据到仓库

## 多人协作更新

1. 每位同事创建自己的 fine-grained GitHub token。
2. token 只授权 `cdq3000/junyan-newmedia-dashboard` 仓库。
3. 权限只给 `Contents: Read and write`。
4. 同事进入后台，输入管理口令和自己的 token。
5. 导入 Excel 后点击“发布到 GitHub”。
6. 后台会把 Excel 原文件上传为 `data/source.xlsx`。
7. GitHub Actions 自动解析 Excel，生成 `data/dashboard-data.json`。
8. 前台大屏每 5 秒读取 GitHub 数据源，通常 1-3 分钟内显示更新。

不要把 GitHub token 固定写进网页源码。这个站点是公开 GitHub Pages，源码也公开；如果把 token 写进去，任何人都能拿到仓库写入权限。

## Excel 同步

后台可以直接导入 Excel。导入后发布的是 Excel 原文件，真正解析在 GitHub Actions 后台完成。保留本地脚本是为了批量自动化或离线校验：

```powershell
& 'C:\Users\lala\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\scripts\sync_excel.py
```

监听 Excel 文件变化：

```powershell
& 'C:\Users\lala\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\scripts\sync_excel.py --watch
```

生成后也可进入后台导入 `data/dashboard-data.json`，再点击“发布到 GitHub”。
