/**
 * Agent 路由 — ReAct 循环 + Tool 调用
 * 
 * Agent 可以：
 * 1. 读取项目文件（架构、角色卡、章节等）
 * 2. 调用 Skill（模块化知识包）
 * 3. 执行写作工作流命令
 */
import { Router } from 'express';
import path from 'node:path';
import { readJson, readText, writeText, ensureDir } from '../utils/fs.js';
import { callLLM } from '../services/llm.js';
import { loadAllSkillsForAgent } from '../services/skills.js';
import {
  getProjectDir,
  getMetaPath,
  getNotesDir,
  listAllChapters,
} from '../utils/paths.js';

const router = Router();

const MAX_TOOL_ROUNDS = 8;

// ─── Agent 可用的 Tools ──────────────────────────────────────
function getAgentTools(projectId) {
  return {
    read_project_state: {
      description: '读取项目的全局配置信息（类型、受众、章数、字数等）',
      execute: async () => {
        const config = await readJson(getMetaPath(projectId, 'config'), {});
        return JSON.stringify(config, null, 2);
      },
    },
    read_architecture: {
      description: '读取故事架构（故事前提、角色图谱、世界观、情节大纲）',
      execute: async () => {
        const arch = await readJson(getMetaPath(projectId, 'architecture'), {});
        return JSON.stringify(arch, null, 2);
      },
    },
    read_characters: {
      description: '读取所有角色卡信息（含动态状态）',
      execute: async () => {
        const chars = await readJson(getMetaPath(projectId, 'characters'), []);
        return JSON.stringify(chars, null, 2);
      },
    },
    read_blueprints: {
      description: '读取章节蓝图列表',
      execute: async (args) => {
        const bps = await readJson(getMetaPath(projectId, 'blueprints'), []);
        if (args.chapter_number) {
          const bp = bps.find(b => b.chapterNumber === Number(args.chapter_number));
          return bp ? JSON.stringify(bp, null, 2) : '未找到该章蓝图';
        }
        return JSON.stringify(bps.slice(0, 20), null, 2);
      },
    },
    read_chapter: {
      description: '读取指定章节的正文内容（草稿/定稿都可以）。参数：chapter_number（章节号）',
      execute: async (args) => {
        const chapters = await listAllChapters(projectId);
        const num = Number(args.chapter_number) || 1;
        const target = chapters.find(c => c.chapterNumber === num);
        if (!target) return `未找到第${num}章`;
        const fullPath = path.join(getProjectDir(projectId), target.relPath);
        const content = await readText(fullPath);
        return `[${target.status === 'finalized' ? '已定稿' : '草稿'}] ${target.filename}\n\n${content}`;
      },
    },
    list_chapters: {
      description: '列出所有章节及其状态（draft/finalized）',
      execute: async () => {
        const chapters = await listAllChapters(projectId);
        if (!chapters.length) return '暂无章节';
        return chapters.map(c =>
          `第${c.chapterNumber}章 ${c.title} [${c.status === 'finalized' ? '已定稿' : '草稿'}]`
        ).join('\n');
      },
    },
    write_note: {
      description: '向项目写入一条笔记/备忘。参数：title（标题）, content（内容）',
      execute: async (args) => {
        const notesDir = getNotesDir(projectId);
        await ensureDir(notesDir);
        const filename = `${Date.now()}-${(args.title || 'note').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.md`;
        await writeText(path.join(notesDir, filename), `# ${args.title || '笔记'}\n\n${args.content || ''}`);
        return `已保存笔记：${filename}`;
      },
    },
  };
}

// ─── 构建 Agent System Prompt ────────────────────────────────
function buildAgentSystemPrompt(tools, skills) {
  const toolDescriptions = Object.entries(tools)
    .map(([name, tool]) => `- ${name}: ${tool.description}`)
    .join('\n');

  const skillDescriptions = skills
    .map(s => `- skill__${s.name}: ${s.description}${s.whenToUse ? ` (${s.whenToUse})` : ''}`)
    .join('\n');

  return `你是 Good AI 写作助手，一个专业的小说创作 Agent。你可以帮助用户进行小说创作的各个环节。

## 可用工具

你可以通过 <tool_call> 标签调用以下工具：

### 项目工具
${toolDescriptions}

### Skills（知识技能包）
${skillDescriptions || '（暂无已加载的 Skill）'}

## 工具调用格式

当你需要使用工具时，请使用以下格式：

<tool_call>
{"name": "工具名称", "arguments": {"参数名": "参数值"}}
</tool_call>

## 重要规则

1. 在回答用户问题前，如果需要了解项目信息，请先调用相关工具获取数据。
2. 每次只调用一个工具。
3. 根据工具返回的结果继续回答或调用下一个工具。
4. 如果不需要工具，直接回答用户问题。
5. 回答时使用中文，保持专业但友好的语气。
6. 你是小说创作专家，擅长情节构思、角色设计、世界观构建、文笔润色等。`;
}

// ─── 解析 Tool 调用 ──────────────────────────────────────────
function parseToolCalls(text) {
  const toolCalls = [];
  const textParts = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) textParts.push(before);
    }
    lastIndex = regex.lastIndex;

    const rawContent = match[1].trim();
    try {
      const data = JSON.parse(rawContent);
      if (data.name) {
        toolCalls.push({ name: data.name, arguments: data.arguments || {} });
      }
    } catch {
      // 容错：提取 JSON
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          if (data.name) {
            toolCalls.push({ name: data.name, arguments: data.arguments || {} });
          }
        } catch {}
      }
    }
  }

  if (lastIndex < text.length) {
    const after = text.slice(lastIndex).trim();
    if (after) textParts.push(after);
  }

  if (toolCalls.length === 0 && textParts.length === 0) {
    textParts.push(text);
  }

  return { textParts, toolCalls };
}

// ─── Agent 对话（ReAct 循环） ────────────────────────────────
router.post('/chat', async (req, res, next) => {
  try {
    const { projectId, messages: userMessages, modelId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    const tools = getAgentTools(projectId);
    const skills = await loadAllSkillsForAgent(projectId);

    // 将 skills 也注册为 tools
    const allTools = { ...tools };
    for (const skill of skills) {
      allTools[`skill__${skill.name}`] = {
        description: skill.description,
        execute: async (args) => {
          let content = skill.content;
          if (args.args) {
            content = content.replace(/\$\{args\}/g, args.args);
            content = content.replace(/\$1/g, args.args);
          }
          return `[Skill: ${skill.displayName || skill.name}]\n\n${content}`;
        },
      };
    }

    const systemPrompt = buildAgentSystemPrompt(allTools, skills);

    // 构建消息
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...userMessages,
    ];

    let rounds = 0;
    let fullResponse = '';
    const toolCallsLog = [];

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const llmResponse = await callLLM(llmMessages, { maxTokens: 4000, task: 'agent', modelId });
      const { textParts, toolCalls } = parseToolCalls(llmResponse);

      // 清理文本
      let textContent = textParts.join('')
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
        .replace(/<\/?tool_call>/g, '')
        .replace(/<\/?tool_result>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (textContent) {
        fullResponse += (fullResponse ? '\n\n' : '') + textContent;
      }

      // 没有 tool 调用，结束循环
      if (toolCalls.length === 0) break;

      // 记录 assistant 回复
      llmMessages.push({ role: 'assistant', content: llmResponse });

      // 执行 tools
      const observations = [];
      for (const tc of toolCalls) {
        const tool = allTools[tc.name];
        if (!tool) {
          observations.push(`<tool_result name="${tc.name}" error="true">未知工具：${tc.name}</tool_result>`);
          toolCallsLog.push({ name: tc.name, status: 'failed', error: '未知工具' });
          continue;
        }

        try {
          const result = await tool.execute(tc.arguments);
          const truncated = result.length > 3000 ? result.slice(0, 3000) + '\n...(已截断)' : result;
          observations.push(`<tool_result name="${tc.name}">\n${truncated}\n</tool_result>`);
          toolCallsLog.push({ name: tc.name, status: 'completed', resultPreview: truncated.slice(0, 100) });
        } catch (err) {
          observations.push(`<tool_result name="${tc.name}" error="true">${err.message}</tool_result>`);
          toolCallsLog.push({ name: tc.name, status: 'failed', error: err.message });
        }
      }

      // 注入 observation
      llmMessages.push({
        role: 'user',
        content: `[工具执行结果]\n\n${observations.join('\n\n')}\n\n[请根据上面的工具结果继续回答。]`,
      });
    }

    res.json({
      content: fullResponse,
      toolCalls: toolCallsLog,
      rounds,
    });
  } catch (err) {
    next(err);
  }
});

// ─── 获取 Agent 配置信息 ─────────────────────────────────────
router.get('/config', async (req, res, next) => {
  try {
    const projectId = req.query.projectId;
    const tools = getAgentTools(projectId || 'demo');
    const skills = projectId ? await loadAllSkillsForAgent(projectId) : [];

    const toolList = Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
    }));

    const skillList = skills.map(s => ({
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      whenToUse: s.whenToUse,
      source: s.source,
    }));

    const systemPromptTemplate = `你是 Good AI 写作助手，一个专业的小说创作 Agent。你可以帮助用户进行小说创作的各个环节。

## 可用工具

你可以通过 <tool_call> 标签调用以下工具：

### 项目工具
{{tools}}

### Skills（知识技能包）
{{skills}}

## 工具调用格式

当你需要使用工具时，请使用以下格式：

<tool_call>
{"name": "工具名称", "arguments": {"参数名": "参数值"}}
</tool_call>

## 重要规则

1. 在回答用户问题前，如果需要了解项目信息，请先调用相关工具获取数据。
2. 每次只调用一个工具。
3. 根据工具返回的结果继续回答或调用下一个工具。
4. 如果不需要工具，直接回答用户问题。
5. 回答时使用中文，保持专业但友好的语气。
6. 你是小说创作专家，擅长情节构思、角色设计、世界观构建、文笔润色等。`;

    res.json({
      tools: toolList,
      skills: skillList,
      systemPromptTemplate,
      maxToolRounds: MAX_TOOL_ROUNDS,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
