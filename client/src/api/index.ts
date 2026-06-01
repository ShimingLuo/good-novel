const BASE = '/api';

async function request<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ─── 项目类型 ────────────────────────────────────────────────
export interface ProjectConfig {
  id?: string;
  title: string;
  genre: string;
  subGenre: string;
  audience: string;
  structure: string;
  pov: string;
  chapterCount: number;
  wordsPerChapter: number;
  coreOutline: string;
  worldSetting: string;
  goldenFinger: string;
  protagonistProfile: string;
  globalGuidance: string;
  writingStyle: string;
}

export interface Architecture {
  premise: string;
  characters: string;
  worldBuilding: string;
  synopsis: string;
}

export interface CharacterCard {
  name: string;
  role: string;
  gender?: string;
  age?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  abilities?: string;
  motivation?: string;
  relationships?: string;
  arc?: string;
  notes?: string;
  currentState?: {
    location?: string;
    powerLevel?: string;
    physicalState?: string;
    mentalState?: string;
    keyItems?: string;
    recentEvents?: string;
    updatedAtChapter?: number;
  };
}

export interface Blueprint {
  chapterNumber: number;
  title: string;
  purpose: string;
  characters: string[];
  keyEvents: string;
  suspenseHook: string;
}

export interface ChapterEntry {
  chapterNumber: number;
  title: string;
  filename: string;
  status: 'draft' | 'finalized';
  relPath: string;
}

export interface BlueprintSyncItem {
  chapterNumber: number;
  blueprintTitle: string;
  draftStatus: 'empty' | 'has_content' | 'finalized';
  draftTitle: string | null;
  draftFilename: string | null;
  relPath: string | null;
}

export interface BlueprintApplyResult {
  needConfirm: boolean;
  chapterNumber: number;
  applied?: boolean;
  filename?: string;
  relPath?: string;
  status?: 'draft' | 'finalized';
  wordCount?: number;
  title?: string;
}

export interface BlueprintApplyAllResult {
  created: number[];
  skippedFinalized: number[];
  skippedHasContent: number[];
  overwritten: number[];
}

export interface ProjectDetail {
  id: string;
  config: ProjectConfig;
  architecture: Architecture;
  outline: string;
  characters: CharacterCard[];
  blueprints: Blueprint[];
  chapters: ChapterEntry[];
}

// ─── 项目 API ────────────────────────────────────────────────
export const api = {
  listProjects: () => request<ProjectConfig[]>('/projects'),
  getProject: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  createProject: (data: Partial<ProjectConfig> & { id: string }) =>
    request<ProjectConfig>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateConfig: (id: string, data: Partial<ProjectConfig>) =>
    request(`/projects/${id}/config`, { method: 'PUT', body: JSON.stringify(data) }),
  renameProject: (id: string, newId: string) =>
    request(`/projects/${id}/rename`, { method: 'PUT', body: JSON.stringify({ newId }) }),
  deleteProject: (id: string) =>
    request(`/projects/${id}`, { method: 'DELETE' }),
  duplicateProject: (id: string, newId: string, newTitle?: string) =>
    request(`/projects/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ newId, newTitle }) }),
  updateArchitecture: (id: string, data: Partial<Architecture>) =>
    request(`/projects/${id}/architecture`, { method: 'PUT', body: JSON.stringify(data) }),
  getCharacters: (id: string) => request<CharacterCard[]>(`/projects/${id}/characters`),
  updateCharacters: (id: string, data: CharacterCard[]) =>
    request(`/projects/${id}/characters`, { method: 'PUT', body: JSON.stringify(data) }),
  getBlueprints: (id: string) => request<Blueprint[]>(`/projects/${id}/blueprints`),
  updateBlueprints: (id: string, data: Blueprint[]) =>
    request(`/projects/${id}/blueprints`, { method: 'PUT', body: JSON.stringify(data) }),
  getBlueprintSync: (id: string) => request<BlueprintSyncItem[]>(`/projects/${id}/blueprints/sync`),
  applyBlueprintToDraft: (id: string, chapterNumber: number, force?: boolean) =>
    request<BlueprintApplyResult>(`/projects/${id}/blueprints/apply`, {
      method: 'POST', body: JSON.stringify({ chapterNumber, force: force || false }),
    }),
  applyAllBlueprints: (id: string, force?: boolean) =>
    request<BlueprintApplyAllResult>(`/projects/${id}/blueprints/apply-all`, {
      method: 'POST', body: JSON.stringify({ force: force || false }),
    }),
  readFile: (id: string, path: string) =>
    request(`/projects/${id}/file?path=${encodeURIComponent(path)}`),
  writeFile: (id: string, path: string, body: any) =>
    request(`/projects/${id}/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  createChapter: (id: string, title?: string) =>
    request<{ filename: string }>(`/projects/${id}/chapters`, {
      method: 'POST', body: JSON.stringify({ title }),
    }),
  deleteFile: (id: string, path: string) =>
    request(`/projects/${id}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
};

// ─── 工作流 API ──────────────────────────────────────────────
export const workflowApi = {
  generateConfig: (projectId: string, userIdea: string) =>
    request('/workflow/generate-config', {
      method: 'POST', body: JSON.stringify({ projectId, userIdea }),
    }),

  generateArchitecture: (projectId: string, step: string, stepGuidance?: string) =>
    request(`/workflow/architecture/${step}`, {
      method: 'POST', body: JSON.stringify({ projectId, stepGuidance }),
    }),

  generateBlueprints: (projectId: string, startChapter: number, endChapter: number) =>
    request('/workflow/blueprints', {
      method: 'POST', body: JSON.stringify({ projectId, startChapter, endChapter }),
    }),

  async streamDraft(projectId: string, chapterNumber: number, userGuidance?: string): Promise<Response> {
    const res = await fetch(`${BASE}/workflow/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, chapterNumber, userGuidance }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Draft request failed');
    }
    return res;
  },

  async streamRefine(projectId: string, chapterNumber: number, draftContent: string, userRefinePrompt?: string): Promise<Response> {
    const res = await fetch(`${BASE}/workflow/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, chapterNumber, draftContent, userRefinePrompt }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Refine request failed');
    }
    return res;
  },

  review: (projectId: string, chapterContent: string) =>
    request('/workflow/review', {
      method: 'POST', body: JSON.stringify({ projectId, chapterContent }),
    }),

  chapterNotes: (projectId: string, chapterNumber: number, chapterTitle: string, chapterContent: string) =>
    request('/workflow/chapter-notes', {
      method: 'POST', body: JSON.stringify({ projectId, chapterNumber, chapterTitle, chapterContent }),
    }),

  updateCharacters: (projectId: string, chapterNumber: number, chapterContent: string) =>
    request('/workflow/update-characters', {
      method: 'POST', body: JSON.stringify({ projectId, chapterNumber, chapterContent }),
    }),

  analyzeStyle: (sampleText: string) =>
    request('/workflow/analyze-style', {
      method: 'POST', body: JSON.stringify({ sampleText }),
    }),

  finalize: (projectId: string, chapterNumber: number, chapterTitle: string, chapterContent: string) =>
    request<{
      success: boolean;
      notes: string | null;
      characterUpdates: any;
      finalizedFile: string | null;
      errors: string[];
    }>('/workflow/finalize', {
      method: 'POST', body: JSON.stringify({ projectId, chapterNumber, chapterTitle, chapterContent }),
    }),
};

// ─── Agent API ───────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentTool {
  name: string;
  description: string;
}

export interface AgentSkill {
  name: string;
  displayName: string;
  description: string;
  whenToUse?: string;
  source: string;
}

export interface AgentConfig {
  tools: AgentTool[];
  skills: AgentSkill[];
  systemPromptTemplate: string;
  maxToolRounds: number;
}

export const agentApi = {
  chat: (projectId: string, messages: ChatMessage[], modelId?: string) =>
    request<{ content: string; toolCalls: any[]; rounds: number }>('/agent/chat', {
      method: 'POST', body: JSON.stringify({ projectId, messages, modelId }),
    }),
  getConfig: (projectId?: string) =>
    request<AgentConfig>(`/agent/config${projectId ? `?projectId=${projectId}` : ''}`),
};

// ─── Skills API ──────────────────────────────────────────────
export interface Skill {
  name: string;
  displayName: string;
  description: string;
  whenToUse?: string;
  content: string;
  source: 'builtin' | 'user' | 'custom' | 'project';
}

export const skillsApi = {
  // 系统级
  listSystem: () => request<Skill[]>('/skills/system'),
  createSystem: (skill: Partial<Skill>) =>
    request<Skill>('/skills/system', { method: 'POST', body: JSON.stringify(skill) }),
  updateSystem: (name: string, skill: Partial<Skill>) =>
    request<Skill>(`/skills/system/${name}`, { method: 'PUT', body: JSON.stringify(skill) }),
  deleteSystem: (name: string) =>
    request(`/skills/system/${name}`, { method: 'DELETE' }),

  // 项目级
  listProject: (projectId: string) => request<Skill[]>(`/skills/project/${projectId}`),
  createProject: (projectId: string, skill: Partial<Skill>) =>
    request<Skill>(`/skills/project/${projectId}`, { method: 'POST', body: JSON.stringify(skill) }),
  updateProject: (projectId: string, name: string, skill: Partial<Skill>) =>
    request<Skill>(`/skills/project/${projectId}/${name}`, { method: 'PUT', body: JSON.stringify(skill) }),
  deleteProject: (projectId: string, name: string) =>
    request(`/skills/project/${projectId}/${name}`, { method: 'DELETE' }),
};

// ─── Prompts API ─────────────────────────────────────────────
export interface PromptUsage {
  stage: string;
  trigger: string;
  icon: string;
}

export interface SystemPromptTemplate {
  key: string;
  name: string;
  description: string;
  systemRole: string;
  content: string;
  builtinSystemRole: string;
  builtinContent: string;
  source: 'builtin' | 'custom';
  usage: PromptUsage;
}

export interface ProjectPromptTemplate {
  key: string;
  name: string;
  description: string;
  usage: PromptUsage;
  builtin: { systemRole: string; content: string };
  system: { systemRole: string; content: string } | null;
  project: {
    override: { systemRole: string; content: string } | null;
    append: { content: string } | null;
  };
  effective: { systemRole: string; content: string };
}

export const promptsApi = {
  // 系统级
  listSystem: () => request<SystemPromptTemplate[]>('/prompts/system'),
  updateSystem: (key: string, data: { systemRole: string; content: string }) =>
    request(`/prompts/system/${key}`, { method: 'PUT', body: JSON.stringify(data) }),
  resetSystem: (key: string) =>
    request(`/prompts/system/${key}`, { method: 'DELETE' }),

  // 项目级
  listProject: (projectId: string) =>
    request<ProjectPromptTemplate[]>(`/prompts/project/${projectId}`),
  setProjectOverride: (projectId: string, key: string, data: { systemRole: string; content: string }) =>
    request(`/prompts/project/${projectId}/${key}/override`, { method: 'PUT', body: JSON.stringify(data) }),
  setProjectAppend: (projectId: string, key: string, content: string) =>
    request(`/prompts/project/${projectId}/${key}/append`, { method: 'PUT', body: JSON.stringify({ content }) }),
  clearProject: (projectId: string, key: string) =>
    request(`/prompts/project/${projectId}/${key}`, { method: 'DELETE' }),
};

// ─── Settings API ────────────────────────────────────────────
export interface ThemePreset {
  id: string;
  label: string;
  type: 'dark' | 'light';
  colors: Record<string, string>;
}

export interface AppSettings {
  'workbench.theme'?: string;
  'workbench.colorCustomizations'?: Record<string, string>;
  'editor.fontSize'?: number;
  'editor.fontFamily'?: string;
  'editor.lineHeight'?: number;
  'editor.tabSize'?: number;
  'editor.wordWrap'?: 'on' | 'off';
  'editor.lineNumbers'?: boolean;
  'ui.fontSize'?: number;
  'ui.density'?: 'compact' | 'normal' | 'comfortable';
  'ui.showStatusBar'?: boolean;
  [key: string]: any;
}

export interface EffectiveSettings {
  effective: AppSettings;
  system: AppSettings;
  project: AppSettings;
  defaults: AppSettings;
}

export const settingsApi = {
  listThemes: () => request<ThemePreset[]>('/settings/themes'),
  getSystem: () => request<AppSettings>('/settings/system'),
  updateSystem: (data: Partial<AppSettings>) =>
    request<AppSettings>('/settings/system', { method: 'PUT', body: JSON.stringify(data) }),
  getProject: (projectId: string) => request<AppSettings>(`/settings/project/${projectId}`),
  updateProject: (projectId: string, data: Partial<AppSettings>) =>
    request<AppSettings>(`/settings/project/${projectId}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeProjectKey: (projectId: string, key: string) =>
    request(`/settings/project/${projectId}/${key}`, { method: 'DELETE' }),
  getEffective: (projectId?: string) =>
    request<EffectiveSettings>(`/settings/effective/${projectId || ''}`),
};

// ─── Pipeline API ────────────────────────────────────────────
export interface PipelineStep {
  id: string;
  name: string;
  action: string;
  params: Record<string, any>;
  dependsOn?: string[];
  skipIfDone?: boolean;
  continueOnError?: boolean;
  loop?: {
    type: 'batch' | 'sequential';
    batchSize?: number;
    from: string | number;
    to: string | number;
  };
}

export interface PipelineStage {
  id: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
}

export interface PipelineInput {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean';
  required?: boolean;
  default?: any;
}

export interface PipelineSettings {
  pauseBetweenStages?: boolean;
  pauseBetweenChapters?: boolean;
  autoReviewBeforeFinalize?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export interface Pipeline {
  name: string;
  displayName: string;
  description: string;
  version: string;
  source?: 'builtin' | 'system' | 'project';
  stages: PipelineStage[];
  inputs: PipelineInput[];
  settings: PipelineSettings;
}

export interface PipelineRunStepState {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  attempts: number;
  result: any;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  loopProgress: { current: any; total: number | null; completed: any[] } | null;
}

export interface PipelineRunStageState {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'paused';
  steps: PipelineRunStepState[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface PipelineRun {
  id: string;
  pipelineName: string;
  pipelineDisplayName: string;
  projectId: string;
  status: 'pending' | 'running' | 'paused' | 'success' | 'failed' | 'cancelled';
  inputs: Record<string, any>;
  settings: PipelineSettings;
  stages: PipelineRunStageState[];
  currentStageIndex: number;
  currentStepIndex: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  logs: Array<{ time: string; level: string; message: string; data?: any }>;
}

export interface PipelineRunSummary {
  id: string;
  pipelineName: string;
  pipelineDisplayName: string;
  status: string;
  currentStageIndex: number;
  totalStages: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export const pipelineApi = {
  /** 列出所有流水线模板 */
  list: (projectId?: string) =>
    request<Pipeline[]>(`/pipelines${projectId ? `?projectId=${projectId}` : ''}`),

  /** 获取单个流水线 */
  get: (name: string, projectId?: string) =>
    request<Pipeline>(`/pipelines/detail/${name}${projectId ? `?projectId=${projectId}` : ''}`),

  /** 创建/更新流水线 */
  save: (pipeline: Pipeline, scope?: 'system' | 'project', projectId?: string) =>
    request<Pipeline>('/pipelines', {
      method: 'POST', body: JSON.stringify({ pipeline, scope, projectId }),
    }),

  /** 删除流水线 */
  delete: (name: string, scope?: string, projectId?: string) =>
    request(`/pipelines/${name}?scope=${scope || 'system'}${projectId ? `&projectId=${projectId}` : ''}`, {
      method: 'DELETE',
    }),

  /** 启动执行 */
  run: (pipelineName: string, projectId: string, inputs?: Record<string, any>) =>
    request<{ runId: string; status: string }>('/pipelines/run', {
      method: 'POST', body: JSON.stringify({ pipelineName, projectId, inputs }),
    }),

  /** 列出项目的执行记录 */
  listRuns: (projectId: string) =>
    request<PipelineRunSummary[]>(`/pipelines/runs/${projectId}`),

  /** 获取执行详情 */
  getRun: (projectId: string, runId: string) =>
    request<PipelineRun>(`/pipelines/runs/${projectId}/${runId}`),

  /** 暂停 */
  pause: (runId: string) =>
    request(`/pipelines/runs/${runId}/pause`, { method: 'POST' }),

  /** 恢复 */
  resume: (runId: string) =>
    request(`/pipelines/runs/${runId}/resume`, { method: 'POST' }),

  /** 取消 */
  cancel: (runId: string) =>
    request(`/pipelines/runs/${runId}/cancel`, { method: 'POST' }),

  /** 继续执行（从中断处恢复） */
  continue: (projectId: string, runId: string) =>
    request<{ ok: boolean; action: string; runId?: string }>(`/pipelines/runs/${projectId}/${runId}/continue`, { method: 'POST' }),

  /** 删除执行记录 */
  deleteRun: (projectId: string, runId: string) =>
    request(`/pipelines/runs/${projectId}/${runId}`, { method: 'DELETE' }),

  /** 列出活跃执行 */
  listActive: () => request<any[]>('/pipelines/active'),
};

// ─── Chat Settings API ───────────────────────────────────────
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatSettings {
  models: ModelConfig[];
  defaultModelId: string;
  modelByTask: Record<string, string>;
  systemPrompt: string;
}

export const TASK_LABELS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'agent', label: 'Agent 对话', desc: '右侧 AI 助手对话' },
  { key: 'generate_config', label: '一键配置', desc: '从灵感生成全局配置' },
  { key: 'architecture_premise', label: '架构 / 故事前提', desc: '' },
  { key: 'architecture_characters', label: '架构 / 角色图谱', desc: '' },
  { key: 'architecture_worldbuilding', label: '架构 / 世界观', desc: '' },
  { key: 'architecture_synopsis', label: '架构 / 情节大纲', desc: '' },
  { key: 'blueprint', label: '章节蓝图', desc: '生成章节蓝图' },
  { key: 'draft', label: '正文生成', desc: '章节正文流式生成' },
  { key: 'refine', label: '精修', desc: '章节精修' },
  { key: 'review', label: '审稿', desc: '一致性审查' },
  { key: 'chapter_notes', label: '章节要点', desc: '定稿后生成要点' },
  { key: 'update_characters', label: '角色卡更新', desc: '定稿后更新角色状态' },
  { key: 'analyze_style', label: '文风分析', desc: '提取写作风格' },
];

export const chatApi = {
  getSettings: () => request<ChatSettings>('/chat/settings'),
  updateSettings: (data: { systemPrompt?: string; defaultModelId?: string; modelByTask?: Record<string, string> }) =>
    request('/chat/settings', { method: 'PUT', body: JSON.stringify(data) }),
  upsertModel: (model: Partial<ModelConfig>) =>
    request<ModelConfig>('/chat/settings/models', { method: 'POST', body: JSON.stringify(model) }),
  deleteModel: (id: string) =>
    request(`/chat/settings/models/${id}`, { method: 'DELETE' }),
  testModel: (id: string) =>
    request<{ ok: boolean; content?: string; error?: string }>(`/chat/settings/models/${id}/test`, { method: 'POST' }),

  async streamChat(messages: ChatMessage[], modelId?: string): Promise<Response> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, modelId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Chat request failed');
    }
    return res;
  },

  syncChat: (messages: ChatMessage[], modelId?: string) =>
    request<{ content: string }>('/chat/completions/sync', {
      method: 'POST', body: JSON.stringify({ messages, modelId }),
    }),
};

// ─── Prompt Sets API ─────────────────────────────────────────
export interface PromptSetMeta {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  active: boolean;
  createdAt?: string;
}

export interface PromptSetsResponse {
  sets: PromptSetMeta[];
  activeSetId: string;
}

export interface SetPromptItem {
  key: string;
  name: string;
  systemRole: string;
  content: string;
  source: 'builtin' | 'custom';
}

export const promptSetsApi = {
  /** 列出所有套件 */
  list: () => request<PromptSetsResponse>('/prompt-sets'),

  /** 获取当前激活套件 */
  getActive: () => request<{ activeSetId: string }>('/prompt-sets/active'),

  /** 切换激活套件 */
  setActive: (setId: string) =>
    request('/prompt-sets/active', { method: 'PUT', body: JSON.stringify({ setId }) }),

  /** 创建新套件 */
  create: (data: { id: string; name: string; description?: string; cloneFrom?: string }) =>
    request<PromptSetMeta>('/prompt-sets', { method: 'POST', body: JSON.stringify(data) }),

  /** 更新套件元信息 */
  update: (id: string, data: { name?: string; description?: string }) =>
    request('/prompt-sets/' + id, { method: 'PUT', body: JSON.stringify(data) }),

  /** 删除套件 */
  delete: (id: string) =>
    request('/prompt-sets/' + id, { method: 'DELETE' }),

  /** 列出套件中的提示词 */
  listPrompts: (setId: string) =>
    request<SetPromptItem[]>(`/prompt-sets/${setId}/prompts`),

  /** 获取单个提示词 */
  getPrompt: (setId: string, key: string) =>
    request<SetPromptItem>(`/prompt-sets/${setId}/prompts/${key}`),

  /** 更新单个提示词 */
  updatePrompt: (setId: string, key: string, data: { systemRole: string; content: string }) =>
    request(`/prompt-sets/${setId}/prompts/${key}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** 重置单个提示词为默认 */
  resetPrompt: (setId: string, key: string) =>
    request(`/prompt-sets/${setId}/prompts/${key}`, { method: 'DELETE' }),
};

// ─── Skill Sets API ──────────────────────────────────────────
export interface SkillSetMeta {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  active: boolean;
  createdAt?: string;
}

export interface SkillSetsResponse {
  sets: SkillSetMeta[];
  activeSetId: string;
}

export const skillSetsApi = {
  /** 列出所有套件 */
  list: () => request<SkillSetsResponse>('/skill-sets'),

  /** 获取当前激活套件 */
  getActive: () => request<{ activeSetId: string }>('/skill-sets/active'),

  /** 切换激活套件 */
  setActive: (setId: string) =>
    request('/skill-sets/active', { method: 'PUT', body: JSON.stringify({ setId }) }),

  /** 创建新套件 */
  create: (data: { id: string; name: string; description?: string; cloneFrom?: string }) =>
    request<SkillSetMeta>('/skill-sets', { method: 'POST', body: JSON.stringify(data) }),

  /** 更新套件元信息 */
  update: (id: string, data: { name?: string; description?: string }) =>
    request('/skill-sets/' + id, { method: 'PUT', body: JSON.stringify(data) }),

  /** 删除套件 */
  delete: (id: string) =>
    request('/skill-sets/' + id, { method: 'DELETE' }),

  /** 列出套件中的 Skills */
  listSkills: (setId: string) =>
    request<Skill[]>(`/skill-sets/${setId}/skills`),

  /** 创建/更新套件中的 Skill */
  upsertSkill: (setId: string, skill: Partial<Skill>) =>
    request(`/skill-sets/${setId}/skills`, { method: 'POST', body: JSON.stringify(skill) }),

  /** 删除套件中的 Skill */
  deleteSkill: (setId: string, name: string) =>
    request(`/skill-sets/${setId}/skills/${name}`, { method: 'DELETE' }),
};
