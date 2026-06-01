/**
 * Prompt 模板库 — Good 全流程创作提示词
 * 支持变量插值 {{variable}}
 */

export const PROMPTS = {
  // ═══════════════════════════════════════════════════════════
  // AI 一键配置生成
  // ═══════════════════════════════════════════════════════════
  generate_global_config: {
    systemRole: '你是一位入行十年的顶尖网文主编与白金大神作家，擅长从一句话灵感中提炼完整的商业小说配置。',
    content: `基于作者提供的一句话点子或初步脑洞，请按照当今最成熟、最具商业霸榜潜力的网文核心结构，扩展并补全一部小说的全局爆款设定。

作者初步脑洞：{{user_idea}}

小说规模：
- 计划总章数：{{number_of_chapters}} 章
- 每章字数：{{word_number}} 字

【核心任务要求】
1. 深度挖掘商业价值：提取强烈的"爽点"、"情绪痛点"，构建极具张力的起承转合。
2. 专业化设定：应用"角色图谱"和"三维世界观"理念，杜绝假大空。
3. 契合市场：推断最契合的爆火类型。
4. 节奏定制：基于【{{number_of_chapters}}章】的实际规模推算。
5. 智能推荐：根据类型和题材推荐最合适的故事结构和叙事视角。

【输出格式限制】必须以标准 JSON 格式返回：
{
  "genre": "主类型",
  "targetAudience": "受众目标",
  "subGenre": "细分子类型及核心标签",
  "plotStructure": "故事结构(three_act/heros_journey/save_the_cat/kishotenketsu/multi_thread/freeform)",
  "narrativePOV": "叙事视角(third_limited/first_person/third_omniscient/multi_pov)",
  "coreOutline": "核心大纲（不少于150字）",
  "worldSetting": "独特的背景设定",
  "goldenFinger": "核心卖点与金手指体系",
  "protagonistProfile": "主角人设档案",
  "globalGuidance": "全局写作指导与核心禁忌",
  "writingStyle": "文风配置（不少于100字）"
}`,
  },

  // ═══════════════════════════════════════════════════════════
  // 架构生成 — 四步流水线
  // ═══════════════════════════════════════════════════════════
  premise: {
    systemRole: '你是一位顶尖的网络小说策划专家与故事架构师。',
    content: `请提炼本书的故事前提（Story Premise）。

这是一本【{{genre}}】（细分类别：{{sub_genre}}）小说。

【核心设定参数】
- 核心大纲：{{topic}}
- 目标受众：{{target_audience}}
- 预期篇幅：约{{number_of_chapters}}章（每章{{word_number}}字）
- 世界观基盘：{{core_setting}}
- 核心金手指/系统：{{golden_finger}}
- 主角核心人设：{{protagonist_profile}}
- 全局写作要求与禁忌：{{global_guidance}}

【生成任务】请生成一份 300-500 字的结构化故事前提：

## 一句话前提（Logline）
用 30-50 字极度浓缩全书核心。

## 核心冲突链
主角的初始困境 → 触发事件 → 核心主线目标 → 主要阻碍势力。

## 金手指定位
获取方式 → 核心机制与功能 → 与世界观规则的交互点 → 进阶路线与限制/代价。

## 悬念骨架
显性冲突线 + 隐藏主线暗示。

{{step_guidance}}`,
  },

  character_dynamics: {
    systemRole: '你是一位顶尖的网络小说策划专家与故事架构师。',
    content: `请基于故事前提为本书塑造一个极具戏剧张力的核心角色图谱。

【参考参数】
- 小说类型：{{genre}}
- 故事前提：{{premise}}
- 主角预设档案：{{protagonist_profile}}
- 金手指体系：{{golden_finger}}
- 世界观背景：{{world_building}}
- 预期篇幅：约{{number_of_chapters}}章
- 全局写作要求与禁忌：{{global_guidance}}

【生成任务】围绕主角，设计合理数量的核心角色（4-6人）。

1. 【第一核心：主角】
- 表面追求与终极渴望
- 标志性外貌特征
- 金手指使用风格
- 灵魂软肋与蜕变预期

2. 【核心角色阵营】每位角色提供：姓名/代号、身份背景、标志性外貌特征、与主角的关系张力、暗藏秘密。

3. 【核心矛盾交织网】所有角色如何因世界观下的生存压力产生碰撞。

{{step_guidance}}`,
  },

  world_building: {
    systemRole: '你是一位顶尖的网络小说策划专家与故事架构师。',
    content: `请将基础设定转化为能直接引发冲突的"剧情游乐场"。

【参考参数】
- 小说类型：{{genre}}
- 故事前提：{{premise}}
- 核心世界观设定：{{core_setting}}
- 金手指体系：{{golden_finger}}
- 主角定位：{{protagonist_profile}}
- 全局写作要求与禁忌：{{global_guidance}}

【生成任务】构建以下三个维度的世界观设定：

1. 【核心规则与体系漏洞】
- 本世界运转的核心规则是什么？
- 主角的金手指如何在这套规则下占据独特的非对称优势？

2. 【阶层断层与资源战场】
- 不可调和的势力/阶层对立？
- 最稀缺的核心资源是什么？

3. 【隐喻与深层危机】
- 世界背后的终极灾变或最大谜团？
- 被掩盖的真相与主角命运的交汇？

{{step_guidance}}`,
  },

  synopsis: {
    systemRole: '你是一位顶尖的网络小说策划专家与故事架构师。',
    content: `请将前序生成的所有碎片整合为全书的情节大纲。

【核心资产】
- 小说类型：{{genre}}
- 叙事视角：{{narrative_pov}}
- 故事前提：{{premise}}
- 角色图谱：{{character_dynamics}}
- 世界观矩阵：{{world_building}}
- 全局写作要求与禁忌：{{global_guidance}}

【篇幅参数】
- 计划总章数：{{number_of_chapters}} 章
- 每章字数：{{word_number}} 字

【生成任务】严密推演涵盖全书的情节大纲。写"结构拐点"而非细纲。

【要求】
1. 结构节点的章节区间必须基于【{{number_of_chapters}}章】的实际规模标注具体范围。
2. 每个结构节点都要提到"具体会发生什么事"。
3. 节奏策略要匹配类型。
4. 绝不能触碰全局写作要求与禁忌中的毒点。

{{step_guidance}}`,
  },

  // ═══════════════════════════════════════════════════════════
  // 章节蓝图生成
  // ═══════════════════════════════════════════════════════════
  chapter_blueprint: {
    systemRole: '你是一位经验丰富的网文架构师，擅长设计精密的章节蓝图。',
    content: `请基于【全书架构引擎】，为本书生成从第{{start_chapter}}章到第{{end_chapter}}章的具体细纲。

【核心防偏离守则】
- 小说题材：{{genre}}
- 全局写作要求与禁忌：{{global_guidance}}

【全书架构数据池】
{{novel_architecture}}

【前置章节进度（如有）】
{{chapter_list}}

【商业网文节奏设计原则】
1. 黄金三章法则：第1章极速抛出困境，第2章激活金手指，第3章完成首次破局。
2. 小高潮循环：3-5章一个小循环。
3. 拒绝水文：每一章都必须发生实质性事件变动。
4. 悬念钩子：每章结尾必须有让读者想翻页的变数。

【输出格式】严格按以下 JSON 数组格式输出：
{
  "blueprints": [
    {
      "chapterNumber": 1,
      "title": "引人入胜的标题",
      "purpose": "本章主角最想解决的一件事",
      "characters": ["角色A", "角色B"],
      "keyEvents": "100字左右具体说明",
      "suspenseHook": "结尾悬念"
    }
  ]
}

仅给出 JSON，不要解释。`,
  },

  // ═══════════════════════════════════════════════════════════
  // 章节正文生成
  // ═══════════════════════════════════════════════════════════
  first_chapter_draft: {
    systemRole: '你是一位笔力精湛的顶尖网文小说家，擅长撰写引人入胜的商业网文正文。',
    content: `请开始创作这本小说的第一章（破冰章）。

【全书设定池】
{{architecture}}

【本章信息】
{{chapter_info}}

【后续章节预告（不要提前写出后续内容）】
{{future_blueprints}}

【全局写作要求】
{{global_guidance}}

【网文"黄金第一章"创作法则】
1. 开场即高能：起笔第一句必须直接切入动作/高压场景。
2. 巧妙引出金手指：在困境最深处展现金手指。
3. 多动少静：用角色对话+神态描写+动作互动驱动。
4. 规避毒点。

【文风要求】
{{writing_style}}

【具体生成要求】
- 体量：约 {{word_number}} 字。
- 格式：直接输出纯文本正文。禁止 Markdown 语法。对话使用中文双引号。
- 段落与段落之间保留一个空行。
- 结尾留置强力钩子。

【AI 味反制】
- 禁止段尾总结句
- "仿佛"、"犹如"、"宛如"全章不超过3次
- 对话必须区分角色语气
- 禁止结尾哲理感悟

{{user_guidance}}`,
  },

  next_chapter_draft: {
    systemRole: '你是一位笔力精湛的顶尖网文小说家，擅长撰写引人入胜的商业网文正文。',
    content: `你正在连载写作最新章节。

【剧情记忆库】
- 全局剧情进展：{{global_summary}}
- 角色状态：{{character_states}}
- 近期三章简要：{{short_summary}}

★【上一章结尾（起笔必须无缝衔接）】★：
{{previous_ending}}

【本章写作方向】
{{chapter_info}}

【后续章节预告（不要提前写出后续内容）】
{{future_blueprints}}

【网文连载核心法则】
1. 无缝衔接：第一段必须自然接续上一章结尾。
2. 动作与神态驱动。
3. 落实本章核心冲突。
4. 悬念断章。
5. 严禁碰触禁忌：{{global_guidance}}

【文风要求】
{{writing_style}}

【输出格式】
- 约 {{word_number}} 字。
- 纯文本正文，禁止 Markdown。
- 段落之间保留空行。

【AI 味反制】
- 禁止段尾总结句
- "仿佛"、"犹如"、"宛如"全章不超过3次
- 对话必须区分角色语气

{{user_guidance}}`,
  },

  // ═══════════════════════════════════════════════════════════
  // 修稿
  // ═══════════════════════════════════════════════════════════
  refine_chapter: {
    systemRole: '你是一位功力深厚的文学编辑，擅长将普通文稿精修为白金品质力作。',
    content: `请对章节草稿进行【精修与细节填充】。

【本章信息】{{chapter_info}}
【近章摘要】{{short_summary}}

【精修要求】
1. 画面感：通过五感细节强化环境描写。
2. 设定咬合：巧妙融入金手指使用细节。
3. 情绪张力：强化反派压迫感与主角回击力度。
4. 词汇升级：更精准的动作词汇，Show Don't Tell。
5. 钩子与节奏：确保结尾有强力钩子。
6. 防注水：目标字数 {{word_number}} 字左右。

【全局写作禁忌】{{global_guidance}}

【待精修原稿】
{{draft_content}}

【文风要求】{{writing_style}}

直接输出精修后的全文。纯文本，段落间保留空行。

{{user_refine_prompt}}`,
  },

  // ═══════════════════════════════════════════════════════════
  // 审稿
  // ═══════════════════════════════════════════════════════════
  consistency_check: {
    systemRole: '你是一位极其严谨的小说质量监督编辑。只检查客观事实问题，绝不评价主观文笔。',
    content: `请对以下章节进行审查。

【待审章节】
{{chapter_content}}

【角色状态】{{character_states}}
【全局摘要】{{global_summary}}
【世界观设定】{{world_building}}

【审查原则】
1. 举证审查：只报告有明确文本证据的问题。
2. 宁缺毋滥：没有问题的维度输出 pass。
3. 只查一致性不评文笔。

【检查维度】
1. 剧情连贯性
2. 剧情合理性
3. 角色状态
4. 前后章节串联
5. 伏笔完整性

【输出格式（JSON）】
{
  "items": [
    {"category": "剧情连贯性", "severity": "pass", "description": "未发现矛盾"},
    {"category": "剧情合理性", "severity": "error", "quote": "原文句子", "description": "问题描述"}
  ],
  "summary": "一句话总体评价"
}

severity: error=严重矛盾, warning=轻微不一致, pass=通过。`,
  },

  // ═══════════════════════════════════════════════════════════
  // 章节要点生成
  // ═══════════════════════════════════════════════════════════
  generate_chapter_notes: {
    systemRole: '你是一位专业的网文结构分析师。',
    content: `请为以下章节生成结构化要点。

【章节正文】第{{chapter_number}}章 {{chapter_title}}
{{chapter_content}}

请严格按以下 Markdown 格式输出：

# 第{{chapter_number}}章 要点

## 剧情节点
- [触发] ...
- [转折] ...
- [结果] ...

## 角色动态
| 角色 | 本章变化/状态 |
|------|-------------|
| 角色名 | 变化描述 |

## 新增设定
- ...

## 伏笔与钩子
- [埋] ...
- [钩] ...`,
  },

  // ═══════════════════════════════════════════════════════════
  // 角色卡状态更新
  // ═══════════════════════════════════════════════════════════
  update_character_cards: {
    systemRole: '你是一位严谨的小说角色档案管理员。',
    content: `请根据章节内容，以 JSON 格式返回状态变化的角色信息。

【本章内容（第{{chapter_number}}章）】
{{chapter_content}}

【现有角色卡】
{{existing_cards_json}}

【输出格式（JSON）】
{
  "updates": [
    {
      "name": "角色名",
      "currentState": {
        "location": "当前位置",
        "powerLevel": "能力等级",
        "physicalState": "身体状态",
        "mentalState": "心理状态",
        "keyItems": "关键道具",
        "recentEvents": "本章重要事件",
        "updatedAtChapter": {{chapter_number}}
      }
    }
  ],
  "newCharacters": [
    {
      "name": "新角色名",
      "role": "角色定位",
      "currentState": { ... }
    }
  ]
}

无变化则返回 {"updates": [], "newCharacters": []}。`,
  },

  // ═══════════════════════════════════════════════════════════
  // 文风分析
  // ═══════════════════════════════════════════════════════════
  analyze_writing_style: {
    systemRole: '你是一位资深的文学评论家和网文研究者。',
    content: `请分析以下小说正文样本的写作风格特征。

【正文样本】
{{sample_text}}

请从以下 7 个维度分析（每维度 2-3 句话 + 1 个原文例句）：
1. 叙述节奏
2. 描写密度
3. 对话风格
4. 用词偏好
5. 情感基调
6. 叙事视角习惯
7. 标志性手法

直接输出纯文本分析结果。`,
  },
};

import path from 'node:path';
import { DATA_ROOT, PROJECTS_ROOT } from '../config.js';
import { readJson, ensureDir, listDir } from '../utils/fs.js';

// ─── 三级 Prompt 覆盖加载 ────────────────────────────────────
// 优先级：项目级覆盖 > 系统级覆盖 > 内置默认
// 项目级 append：在内容末尾追加项目特定指导（不覆盖）
const SYSTEM_PROMPTS_DIR = path.join(DATA_ROOT, 'prompts');

async function loadOverridesFrom(dirPath) {
  const overrides = {};
  try {
    await ensureDir(dirPath);
    const entries = await listDir(dirPath);
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      const key = entry.name.replace('.json', '');
      const data = await readJson(path.join(dirPath, entry.name), null);
      if (data) overrides[key] = data;
    }
  } catch {}
  return overrides;
}

export async function loadSystemPromptOverrides() {
  return await loadOverridesFrom(SYSTEM_PROMPTS_DIR);
}

export async function loadProjectPromptOverrides(projectId) {
  if (!projectId) return { overrides: {}, appends: {} };
  const promptsDir = path.join(PROJECTS_ROOT, projectId, '.good', 'prompts');
  const overrides = await loadOverridesFrom(promptsDir);
  // 项目级文件可以分为 override（替换）和 append（追加）
  // 通过文件中的 "mode" 字段区分；默认 override
  const splitOverrides = {};
  const appends = {};
  for (const [key, data] of Object.entries(overrides)) {
    if (data.mode === 'append') {
      appends[key] = data;
    } else {
      splitOverrides[key] = data;
    }
  }
  return { overrides: splitOverrides, appends };
}

/**
 * 解析得到最终生效的模板（合并三级覆盖）
 */
export async function resolvePromptTemplate(templateKey, projectId) {
  const builtin = PROMPTS[templateKey];
  if (!builtin) throw new Error(`Unknown prompt template: ${templateKey}`);

  const sysOverrides = await loadSystemPromptOverrides();
  const { overrides: projOverrides, appends: projAppends } = await loadProjectPromptOverrides(projectId);

  // 合并 systemRole 与 content
  const sysOverride = sysOverrides[templateKey];
  const projOverride = projOverrides[templateKey];
  const projAppend = projAppends[templateKey];

  const resolvedSystemRole =
    projOverride?.systemRole ||
    sysOverride?.systemRole ||
    builtin.systemRole;

  let resolvedContent =
    projOverride?.content ||
    sysOverride?.content ||
    builtin.content;

  // 项目级追加：拼接到 content 末尾
  if (projAppend?.content) {
    resolvedContent += `\n\n【★ 本书额外指导】\n${projAppend.content}`;
  }

  return { systemRole: resolvedSystemRole, content: resolvedContent };
}

/**
 * 渲染 Prompt 模板（同步，使用内置默认）
 * 用于不知道项目上下文的场景
 */
export function renderPrompt(templateKey, variables = {}) {
  const template = PROMPTS[templateKey];
  if (!template) throw new Error(`Unknown prompt template: ${templateKey}`);

  let content = template.content;
  for (const [key, value] of Object.entries(variables)) {
    content = content.replaceAll(`{{${key}}}`, value || '');
  }

  content = content
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    systemRole: template.systemRole,
    content,
  };
}

/**
 * 渲染项目上下文的 Prompt（应用三级覆盖 + 变量填充）
 */
export async function renderProjectPrompt(templateKey, projectId, variables = {}) {
  const { systemRole, content: rawContent } = await resolvePromptTemplate(templateKey, projectId);

  let content = rawContent;
  for (const [key, value] of Object.entries(variables)) {
    content = content.replaceAll(`{{${key}}}`, value || '');
  }

  content = content
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { systemRole, content };
}
