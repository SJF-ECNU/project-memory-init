# Memory Constellation

Memory Constellation（记忆星图）是一个为 Project Memory 设计的 Obsidian 2D 关系视图。它不追求 3D 漫游或显示所有文件名，而是把首页、稳定记忆、工作流、工作记录和项目文档排成一张稳定、克制的关系图谱。

## 视觉特点

- 固定的语义轨道，节点不会持续漂移。
- 黑灰背景与控件，低饱和节点分层：香槟核心、灰紫记忆、雾蓝工作流和蓝灰记录。
- 主要节点具有透色玻璃内层与细边反光，小节点保持较实的颜色，兼顾材质和可辨识性。
- 玻璃胶囊式浮动工具栏：背景透出、银白边缘反光、指针跟随高光和按钮轻微回弹。
- 小范围幕布柔光缓动跟随鼠标，移动时轻微拉伸、停下后恢复圆形；单次生成的抖色纹理减轻暗部色带。
- 柔光进入搜索胶囊时被背景滤镜进一步柔化；离开视图后淡出，文字不参与模糊。
- 默认所有节点以正常亮度显示。
- 未选中时，悬停节点立即突出它的一跳关系与相关标签，移开后恢复全图亮度；单击后保持锁定。
- 长时间戳工作记录自动显示为短语义标题。
- 标签会根据优先级、聚焦状态和缩放级别渐进出现，并尝试多个位置避让。
- 首页、记忆、工作流和文档分类保留名称，必要时向外错开并用细引导线连接。
- 节点、连线和文字在悬停切换时连续过渡；未锁定时鼠标移开恢复全图，不自动锁定首页。
- 动画结束后停止重绘，不持续占用渲染帧。
- 支持系统的“减少动态效果”偏好。
- 支持“减少透明度”偏好和背景滤镜不可用时的不透明降级。

玻璃效果是受 [Apple Liquid Glass](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/) 启发的 Web 视觉实现，并非原生系统材质，不模拟真实光学折射。浮动控件使用背景模糊与高光，主要节点使用 Canvas 透色内层与反射，图谱文字保持清晰。

## 交互

- **记忆 / 记忆 + 文档**：切换只查看 Project Memory，或加入受管项目文档。
- **简洁 / 全景**：切换标签密度；两种模式下未悬停时所有节点均正常显示。
- **悬停节点**：临时突出节点、直接关系与标签，无需点击。
- **单击节点**：锁定当前笔记及直接关系，再点同一节点取消。锁定时移动鼠标不会替换关系集合，方便继续选择小节点；Enter 打开选中笔记。
- **双击节点**：在新标签中打开源笔记。
- **关联笔记侧栏**：选中后展开直接关联列表，显示完整标题、类型和路径，可筛选。单击条目定位并选中该笔记；独立 ↗ 按钮直接打开文件。侧栏首次出现在点击节点的另一侧，后续导航保持位置，不挤动图谱。
- **取消锁定**：再次单击同一节点、单击画布空白处、按 Esc 或关闭侧栏。未选中时恢复原有悬停预览。
- **拖拽 / 滚轮**：平移与缩放。
- **右下角 − / + / 适应全图**：调整比例并让全部节点回到画面内。
- **右下角 ↶ 重播生长动画**：用 10 秒从空白重播当前范围，先核心、再关联节点，曲线延伸后标签出现；按当前图谱的层级时长统一放慢，不随笔记数量逐个累加时间。范围切换仍保持原来的短过渡。
- **范围切换过渡**：保留现有记忆，镜头平滑调整，新文档沿关系展开；收起时约 0.28 秒淡出。快速反向切换从当下画面连续衔接，不排队。系统开启减少动态效果时直接显示最终图谱。
- **搜索**：输入即显示匹配结果；按标题、完整文件名与路径检索，支持空格组合多个关键词，不区分英文大小写与全半角。精确标题优先，结果标明类型和完整路径，帮助区分同名笔记。
- **搜索结果操作**：↑/↓ 选择，Enter 或单击结果定位，⌘/Ctrl+Enter（或修饰键单击）在新标签打开，Esc 收起结果。支持中文输入法确认，不误跳转。
- 搜索只覆盖当前“记忆 / 记忆 + 文档”范围，不扫描正文；范围和无匹配提示会直接显示。结果跟随 Vault 数据刷新，不保留旧 checkout 的文件。
- 搜索胶囊使用固定开关栏位，范围切换、标签切换与展开结果都不改变外框宽度。
- **画布内 Esc / Enter / + / -**：取消锁定、打开当前笔记和缩放。

## 安装

本插件在仓库的 [`memory-constellation` 分支](https://github.com/SJF-ECNU/project-memory-init/tree/memory-constellation)独立维护；[main 分支](https://github.com/SJF-ECNU/project-memory-init/tree/main)只发布核心 Project Memory Skill 和模板。使用 Node.js 22 或更新版本。

```bash
git clone --branch memory-constellation --single-branch https://github.com/SJF-ECNU/project-memory-init.git memory-constellation
cd memory-constellation/obsidian-memory-constellation
npm ci
npm run build
```

1. 按上面的命令在插件目录完成构建，生成 `main.js`。
2. 把 `main.js`、`manifest.json` 和 `styles.css` 复制到 Vault 的 `.obsidian/plugins/memory-constellation/`。
3. 在 Obsidian 的“第三方插件”中启用 **Memory Constellation**。
4. 点击左侧星光图标，或在命令面板运行“打开记忆星图”。

更新已有安装时先备份上述三个文件，再复制并重新加载插件。本次提供源码分支，不是社区插件商店上架；生成的 `main.js` 和依赖目录不提交到 Git。

## 数据边界

插件只读取当前 Vault 的 Markdown 文件、frontmatter 和 Obsidian `resolvedLinks`。它不创建图数据库，不写入、移动、重命名或删除笔记。切换 Git checkout 后，视图会在 Obsidian 刷新元数据时从当前文件重建。

`project-memory/模板/`、`project-memory/project-memory/` 和 `docs/superpowers/` 默认排除。

## 开发

```bash
npm test
npm run check
npm run build
```

实现只使用 Obsidian 公开 API 和 Canvas 2D，无额外运行时依赖。项目采用仓库根目录的 MIT License。
