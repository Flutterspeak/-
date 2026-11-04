# 墨迹 · 小说工作台

一个简易的本地小说写作工具：设定人物与世界观，写下本章情节要点，让 AI 按指定文风一章一章地写下去；每章生成后自动更新故事梗概，下一章会带着前情继续。

## 功能

- 按人物性格、世界观、整体文风和本章要点生成当前章节
- 支持为单章单独指定风格与目标字数
- 流式输出，可随时停止，已生成内容会保留
- 每章生成后自动压缩更新「故事到目前为止」的梗概，并保存各章摘要
- 保存每次生成所用的完整提示词，可随时查看、复制
- 兼容 OpenAI 格式的接口（DeepSeek、OpenAI、Moonshot 等），API 地址可配置
- 数据保存在浏览器本地，可导出整本小说为 txt

## 环境要求

- Node.js 18 或更高版本（使用 Node 内置的 `fetch`，无需安装依赖）
- 现代浏览器

## 启动

在项目目录执行：

```bash
node server.mjs
```

或：

```bash
npm start
```

然后打开 <http://127.0.0.1:5178>。

服务只监听本机 `127.0.0.1`，不会暴露到局域网。按 `Ctrl+C` 停止服务。如果 5178 端口被占用，可以通过环境变量换端口：

```bash
# Windows PowerShell
$env:PORT=5179; node server.mjs
```

## 配置 AI 接口

### 方式一：在页面中配置（推荐）

1. 点击右上角「API 设置」
2. 填写 API 地址、API Key、模型名称
3. 点击「测试连接」确认可用后保存

常见配置：

| 服务 | API 地址 | 模型示例 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

地址可以填到 `/v1` 为止，也可以直接填写完整的 `/chat/completions` 地址。

### 方式二：使用本地配置文件

复制示例文件并填入自己的 Key：

```bash
cp public/config.example.json public/config.local.json
```

Windows PowerShell 也可以直接：

```powershell
Copy-Item public/config.example.json public/config.local.json
```

然后编辑 `public/config.local.json`：

```json
{
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "sk-你的Key",
  "model": "deepseek-chat"
}
```

刷新页面即可自动带入。`config.local.json` 已被 `.gitignore` 排除，**不要提交到仓库**。

> API Key 会保存在本机文件或浏览器 localStorage 中。请勿把包含 Key 的文件发给他人；如果 Key 曾公开，建议在服务商控制台轮换。

## 使用流程

1. 在「设定」中填写世界观、整体文风、叙事人称，并添加人物（姓名、身份、性格）
2. 在「章节」中新建章节，填写「本章情节要点」，必要时填写本章风格
3. 点击「生成本章」，等待流式输出；生成完成后会自动更新故事梗概
4. 在「情节总结」中查看累计梗概和各章摘要，梗概可以手动修改
5. 点击「查看提示词」可以查看本次生成实际发送的系统提示词和用户提示词
6. 点击右上角「导出」保存整本小说为 txt

在「本章情节要点」输入框中按 `Ctrl+Enter` 也可以直接开始生成。

## 数据与备份

- 小说设定、章节正文、摘要、提示词均保存在浏览器 localStorage 的 `moji-novel-workbench-v1` 中
- 清除浏览器站点数据会丢失项目内容，请定期用「导出」备份正文
- 导出的 txt 只包含章节正文，不包含设定、摘要和提示词
- 换浏览器或换设备不会自动同步数据

## 目录结构

```text
.
├── server.mjs                 # 本地静态服务 + OpenAI 兼容接口流式代理
├── package.json
├── public
│   ├── index.html
│   ├── styles.css
│   ├── app.js                 # 页面逻辑与数据存储
│   ├── config.example.json    # 本地配置示例（可提交）
│   └── config.local.json      # 个人 Key 配置（被 git 忽略）
└── README.md
```

## 说明与限制

- 本项目是单人本地工具，没有登录、数据库和云端同步
- 每次生成都会消耗所配置服务商的 API 额度
- AI 生成内容请自行校对；梗概是压缩后的剧情档案，可能存在遗漏
- 服务默认只绑定 `127.0.0.1`，不适合直接部署到公网
