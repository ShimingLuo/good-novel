/**
 * Skills 服务 — 三级 Skills 加载
 * 优先级：项目级 > 系统级（用户自定义） > 内置
 *
 * 系统级：data/skills/{name}.json
 * 项目级：projects/{id}/.good/skills/{name}.json
 */
import path from 'node:path';
import { DATA_ROOT, PROJECTS_ROOT } from '../config.js';
import { readJson, listDir, ensureDir } from '../utils/fs.js';

const SYSTEM_SKILLS_DIR = path.join(DATA_ROOT, 'skills');

// ─── 内置 Skills（与 Vela 完全同步） ─────────────────────────
export const BUILTIN_SKILLS = [
  {
    name: 'review-chapter',
    displayName: '章节审阅',
    description: '对指定章节进行全面的质量审阅，包括剧情逻辑、角色一致性、节奏感、伏笔呼应等多个维度。',
    whenToUse: '用户要求审阅、检查、评估某个章节时',
    source: 'builtin',
    content: `# 章节审阅

请对目标章节进行专业的小说审阅。依次检查以下维度：

## 1. 剧情逻辑
- 情节是否连贯，有无逻辑矛盾
- 因果关系是否成立

## 2. 角色一致性
- 角色行为是否符合既定性格
- 对话风格是否一致

## 3. 节奏感
- 张弛是否有度
- 是否有不必要的拖沓或过于仓促的转折

## 4. 伏笔与呼应
- 已有伏笔是否得到了回应
- 新埋的伏笔是否自然

## 5. 文笔与风格
- 描写是否生动
- 是否符合整体文风设定

请先使用 read_chapter 工具读取目标章节，再使用 read_architecture 读取故事架构进行对比评估。
输出格式：每个维度评分（1-5星）+ 详细说明 + 修改建议。`,
  },
  {
    name: 'brainstorm',
    displayName: '脑暴创意',
    description: '针对指定话题进行创意脑暴，生成多个创意方向和灵感。',
    whenToUse: '用户要求头脑风暴、找灵感、想创意时',
    source: 'builtin',
    content: `# 创意脑暴

请围绕用户给出的话题进行专业的创意脑暴。

## 输出格式

为每个创意方向提供：
1. **创意概念**（一句话）
2. **详细展开**（100-200 字）
3. **可行性评估**（高/中/低）
4. **与已有剧情的融合度**

请先使用 read_architecture 和 read_project_state 了解项目背景，确保创意与现有设定不矛盾。
至少提供 5 个不同方向的创意。`,
  },
  {
    name: 'character-analysis',
    displayName: '角色分析',
    description: '深入分析指定角色的性格、动机、角色弧、人物关系等。',
    whenToUse: '用户想深入了解或调整角色设定时',
    source: 'builtin',
    content: `# 角色深度分析

请对目标角色进行全方位的深度分析。

## 分析维度

1. **核心性格特质** — MBTI、大五人格倾向
2. **深层动机** — 驱动角色行动的核心诉求
3. **角色弧预测** — 基于当前设定推演角色成长轨迹
4. **关系网络** — 与其他角色的关系图谱
5. **冲突点** — 角色面临的核心矛盾和困境
6. **独特标识** — 口头禅、习惯动作、标志性特征

请先使用 read_characters 读取角色卡，以及 read_architecture 了解故事结构。`,
  },
  {
    name: 'continuity-check',
    displayName: '连续性检查',
    description: '检查小说中的设定一致性和连续性问题，发现矛盾和遗漏。',
    whenToUse: '用户想检查设定有没有矛盾、是否有不一致的地方时',
    source: 'builtin',
    content: `# 连续性与一致性检查

请对项目进行全面的连续性检查。

## 检查项

1. **时间线一致性** — 事件发生顺序是否合理
2. **地理一致性** — 地点描述是否前后一致
3. **角色状态** — 角色的伤病、装备、能力等是否正确追踪
4. **设定遵守** — 是否与世界观设定产生矛盾
5. **伏笔追踪** — 哪些伏笔已回收，哪些待回收

请使用 list_chapters 了解进度，使用 read_architecture 获取设定，逐章检查关键节点。
输出为表格形式，标注问题严重程度（🔴严重 / 🟡注意 / 🟢正常）。`,
  },
  {
    name: 'writing-coach',
    displayName: '写作教练',
    description: '提供专业的写作技巧指导和文笔改善建议。',
    whenToUse: '用户想提高写作水平、求教写作技巧时',
    source: 'builtin',
    content: `# 写作教练

作为专业的写作教练，为用户提供针对性的指导。

## 指导范围

- 叙述技巧（视角运用、时间线处理）
- 描写技法（环境渲染、人物刻画）
- 对话写作（个性化对话、潜台词运用）
- 节奏控制（场景切换、留白技巧）
- 悬念设置（钩子、反转、暗线）

请先使用 read_project_state 了解项目的写作风格设定，再根据用户的具体问题提供定制化建议，并附上示例对比。`,
  },
  {
    name: 'chinese-novelist',
    displayName: '中文小说创作',
    description: '全自动中文小说写作技能，支持读取系统配置、三层递进式问答、大纲生成、人物档案、逐章写作、润色去AI味处理。',
    whenToUse: '用户要求写小说、创作故事、生成完整长篇小说时',
    source: 'builtin',
    content: `# 中文小说创作技能

一款面向 Good AI 写作系统的全自动中文小说写作技能工具，可一键生成完整长篇小说。

## 核心功能

- **读取系统配置**：自动读取项目现有配置（题材、受众、篇幅、金手指等）
- **三层递进式智能问答**：快速设定或随机生成小说核心信息
- **偏好记忆能力**：自动学习用户写作习惯，跨会话保留偏好
- **断点续写**：支持意外中断后从断点自动续写
- **多种写作模式**：串行、子 Agent 并行、Agent Teams
- **自动校验修复**：检查字数与连贯性，不合格自动重写

## 创作流程

### Phase 0: 初始化
- 调用 read_project_state 读取项目全局配置
- 调用 read_architecture 读取已有故事架构
- 检测中断状态和已有进度

### Phase 1: 配置确认与补充

**L1: 核心定位（必答，优先使用系统配置）**
- 小说题材/类型（genre）：都市、玄幻、仙侠、悬疑、科幻等
- 目标受众（audience）：男频/女频/全年龄
- 预计篇幅（chapterCount）：短篇/中篇/长篇（章节数）
- 核心卖点/金手指（goldenFinger）：故事核心亮点

**L2: 深度定制（可选）**
- 主角设定（protagonistProfile）：姓名、年龄、性格、背景
- 核心冲突与世界观（worldSetting）
- 写作风格偏好（writingStyle）：文风要求
- 全局禁忌（globalGuidance）：避免内容

### Phase 2: 规划与确认

生成以下内容供用户确认：
1. **故事前提（premise）**：提炼核心冲突
2. **角色图谱（characters）**：主要角色关系网
3. **世界观（worldBuilding）**：构建世界观矩阵
4. **情节大纲（synopsis）**：分卷/分章结构

### Phase 3: 生成蓝图

基于大纲生成章节蓝图（Blueprint），每章包含：
- chapterNumber: 章节号
- title: 章节标题
- purpose: 本章目的
- characters: 涉及角色
- keyEvents: 关键事件
- suspenseHook: 章末悬念钩子

### Phase 4: 疯狂创作

逐章执行：
1. 写前分析 → 明确本章目标
2. 撰写正文（按 wordsPerChapter 设置，默认3000-5000字）
3. 润色去AI味处理
4. 字数检查与调整

### Phase 5: 自动校验与修复
- 字数检查（确保每章达标）
- 连贯性检查（前后呼应）
- 不合格自动重写（最多3轮）

## 创作法则

- 开头即高潮：抓住读者注意力
- 结尾留悬念：章末钩子促继续阅读
- 冲突驱动剧情：保持紧张感
- 节奏有张有弛：避免单调

## 输出格式规范

### 故事架构输出
【故事前提】
（精炼的一句话核心冲突）

【角色图谱】
- 主角：姓名，身份，动机
- 配角：姓名，身份，与主角关系

【世界观】
（世界规则、历史背景、势力分布）

【情节大纲】
第1-10章：第一卷 开端
第11-20章：第二卷 发展
...

### 章节蓝图输出
第X章：章标题
【目的】本章在故事中的作用
【人物】涉及角色列表
【事件】关键情节发展
【钩子】章末悬念

### 章节正文输出
- 每章字数：遵循项目配置（wordsPerChapter）
- 格式：纯文本，段落分明
- 风格：遵循写作风格设定（writingStyle）

## 使用方法

在 Agent 对话中输入：
"使用 chinese-novelist 帮我写一部小说"

然后根据提示逐步回答问题即可。

## 重要提示

1. 如果项目已有配置，技能会自动读取并使用
2. 输出会遵循系统设定的字数要求和写作风格
3. 生成的章节会符合系统的 Blueprint 格式`,
  },
];

async function loadSkillsFromDir(dirPath, source) {
  const skills = [];
  try {
    await ensureDir(dirPath);
    const entries = await listDir(dirPath);
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      const skill = await readJson(path.join(dirPath, entry.name), null);
      if (skill && skill.name) {
        skills.push({ ...skill, source });
      }
    }
  } catch {}
  return skills;
}

/** 加载系统级 Skills（含内置 + 用户自定义） */
export async function loadSystemSkills() {
  const userSkills = await loadSkillsFromDir(SYSTEM_SKILLS_DIR, 'user');

  // 内置 Skill 会被同名 user Skill 覆盖
  const merged = [...BUILTIN_SKILLS];
  for (const u of userSkills) {
    const idx = merged.findIndex(s => s.name === u.name);
    if (idx >= 0) merged[idx] = { ...u, source: 'custom' };
    else merged.push(u);
  }
  return merged;
}

/** 加载项目级 Skills */
export async function loadProjectSkills(projectId) {
  if (!projectId) return [];
  const dir = path.join(PROJECTS_ROOT, projectId, '.good', 'skills');
  const skills = await loadSkillsFromDir(dir, 'project');
  return skills;
}

/**
 * 加载 Agent 可用的所有 Skills（合并系统 + 项目）
 * 项目级同名 skill 会覆盖系统级
 */
export async function loadAllSkillsForAgent(projectId) {
  const sys = await loadSystemSkills();
  const proj = await loadProjectSkills(projectId);

  const merged = [...sys];
  for (const p of proj) {
    const idx = merged.findIndex(s => s.name === p.name);
    if (idx >= 0) merged[idx] = { ...p, source: 'project' };
    else merged.push(p);
  }
  return merged;
}

export const SYSTEM_SKILLS_PATH = SYSTEM_SKILLS_DIR;
export function getProjectSkillsDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId, '.good', 'skills');
}
