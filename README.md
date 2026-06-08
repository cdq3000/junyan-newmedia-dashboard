# 骏延集团新媒体数据 3D 可视化大屏

## 本地运行

1. 同步 Excel 到页面数据：

```powershell
& 'C:\Users\lala\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\scripts\sync_excel.py
```

2. 启动本地网页服务：

```powershell
& 'C:\Users\lala\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m http.server 8765
```

3. 打开：

```text
http://localhost:8765
```

## 每周更新

如果 Excel 文件仍放在桌面且文件名不变，运行监听模式：

```powershell
& 'C:\Users\lala\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\scripts\sync_excel.py --watch
```

脚本每 5 秒检查一次 Excel 修改时间，发现更新后自动重建 `data/dashboard-data.json`。网页也会每 5 秒重新读取 JSON，因此打开页面时会自动刷新数据。

## 新增门店

- 如果新门店写进 Excel 的月度对比表或数据明细表，运行同步脚本后会自动进入页面。
- 页面右上角的“新增门店”用于临时添加空门店，保存在当前浏览器的 `localStorage`，适合先占位。

## GitHub 发布

这个项目是纯静态页面，可以发布到 GitHub Pages。需要你提供：

- GitHub 仓库地址，或允许我创建新仓库。
- 是否要我创建分支、提交并打开 PR。
- 如果需要自动化周更，需要选择数据来源：继续手动上传 Excel 后本地同步，或把 Excel/JSON 提交到仓库并用 GitHub Actions 生成页面数据。
