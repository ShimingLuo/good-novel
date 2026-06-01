<script setup lang="ts">
import { ref, reactive, onMounted, computed, onUnmounted } from 'vue';
import { pipelineApi, type Pipeline, type PipelineRun, type PipelineRunSummary, type PipelineStage, type PipelineStep } from '../api';
import { useWorkspace } from '../stores/workspace';

const workspace = useWorkspace();

const pipelines = ref<Pipeline[]>([]);
const runs = ref<PipelineRunSummary[]>([]);
const activeRun = ref<PipelineRun | null>(null);
const selectedPipeline = ref<Pipeline | null>(null);
const isLoading = ref(false);
const error = ref('');
const view = ref<'list' | 'detail' | 'run' | 'editor'>('list');

// 详情视图中展开的 stage
const expandedStages = ref<Set<string>>(new Set());
// 输入表单
const inputValues = ref<Record<string, any>>({});
// 轮询
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── 可用 actions ────────────────────────────────────────────
const AVAILABLE_ACTIONS = [
  { action: 'workflow/generate-config', label: '一键生成配置', desc: '基于灵感生成全局小说配置' },
  { action: 'workflow/architecture/premise', label: '故事前提', desc: '生成 Story Premise' },
  { action: 'workflow/architecture/characters', label: '角色图谱', desc: '生成核心角色设计' },
  { action: 'workflow/architecture/worldbuilding', label: '世界观', desc: '构建世界观矩阵' },
  { action: 'workflow/architecture/synopsis', label: '情节大纲', desc: '生成全书情节大纲' },
  { action: 'workflow/blueprints', label: '章节蓝图', desc: '批量生成章节细纲' },
  { action: 'workflow/draft', label: '正文生成', desc: '生成章节正文草稿' },
  { action: 'workflow/refine', label: '精修', desc: '精修润色章节' },
  { action: 'workflow/review', label: '审稿', desc: '一致性审查' },
  { action: 'workflow/finalize', label: '定稿', desc: '要点+角色卡+发布' },
];

// ─── 编辑器状态 ──────────────────────────────────────────────
const editForm = reactive({
  name: '',
  displayName: '',
  description: '',
  version: '1.0.0',
  stages: [] as Array<{
    id: string; name: string; description: string;
    steps: Array<{ id: string; name: string; action: string; paramsJson: string; dependsOn: string; loopType: string; loopFrom: string; loopTo: string; loopBatchSize: number; continueOnError: boolean }>;
  }>,
  inputsJson: '[]',
  settingsJson: '{}',
});
const editError = ref('');
const editExpandedStages = ref<Set<number>>(new Set());

function resetEditForm() {
  editForm.name = '';
  editForm.displayName = '';
  editForm.description = '';
  editForm.version = '1.0.0';
  editForm.stages = [];
  editForm.inputsJson = '[]';
  editForm.settingsJson = JSON.stringify({ pauseBetweenStages: false, maxRetries: 1, retryDelay: 3000 }, null, 2);
  editError.value = '';
  editExpandedStages.value = new Set();
}

function pipelineToForm(p: Pipeline) {
  editForm.name = p.name;
  editForm.displayName = p.displayName;
  editForm.description = p.description;
  editForm.version = p.version || '1.0.0';
  editForm.stages = p.stages.map(stage => ({
    id: stage.id,
    name: stage.name,
    description: (stage as any).description || '',
    steps: stage.steps.map(step => ({
      id: step.id,
      name: step.name,
      action: step.action,
      paramsJson: JSON.stringify(step.params || {}),
      dependsOn: (step.dependsOn || []).join(', '),
      loopType: step.loop?.type || '',
      loopFrom: step.loop ? String(step.loop.from) : '',
      loopTo: step.loop ? String(step.loop.to) : '',
      loopBatchSize: step.loop?.batchSize || 10,
      continueOnError: (step as any).continueOnError || false,
    })),
  }));
  editForm.inputsJson = JSON.stringify(p.inputs || [], null, 2);
  editForm.settingsJson = JSON.stringify(p.settings || {}, null, 2);
  editExpandedStages.value = new Set(p.stages.map((_, i) => i));
}

function formToPipeline(): Pipeline {
  const stages: PipelineStage[] = editForm.stages.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    steps: s.steps.map(st => {
      const step: any = { id: st.id, name: st.name, action: st.action, params: JSON.parse(st.paramsJson || '{}') };
      if (st.dependsOn.trim()) step.dependsOn = st.dependsOn.split(',').map(d => d.trim()).filter(Boolean);
      if (st.loopType) step.loop = { type: st.loopType, from: st.loopFrom, to: st.loopTo, ...(st.loopType === 'batch' ? { batchSize: st.loopBatchSize } : {}) };
      if (st.continueOnError) step.continueOnError = true;
      return step;
    }),
  }));
  return {
    name: editForm.name,
    displayName: editForm.displayName,
    description: editForm.description,
    version: editForm.version,
    stages,
    inputs: JSON.parse(editForm.inputsJson || '[]'),
    settings: JSON.parse(editForm.settingsJson || '{}'),
  };
}

// ─── 编辑器操作 ──────────────────────────────────────────────
function addStage() {
  const idx = editForm.stages.length;
  editForm.stages.push({ id: `stage-${idx + 1}`, name: '', description: '', steps: [] });
  editExpandedStages.value.add(idx);
}
function removeStage(idx: number) {
  editForm.stages.splice(idx, 1);
  editExpandedStages.value.delete(idx);
}
function addStep(stageIdx: number) {
  editForm.stages[stageIdx].steps.push({ id: '', name: '', action: '', paramsJson: '{}', dependsOn: '', loopType: '', loopFrom: '', loopTo: '', loopBatchSize: 10, continueOnError: false });
}
function removeStep(stageIdx: number, stepIdx: number) {
  editForm.stages[stageIdx].steps.splice(stepIdx, 1);
}
function toggleEditStage(idx: number) {
  if (editExpandedStages.value.has(idx)) editExpandedStages.value.delete(idx);
  else editExpandedStages.value.add(idx);
}

// ─── 数据加载 ────────────────────────────────────────────────
async function loadPipelines() {
  try { pipelines.value = await pipelineApi.list(workspace.currentProjectId); } catch (e: any) { error.value = e.message; }
}
async function loadRuns() {
  if (!workspace.currentProjectId) return;
  try { runs.value = await pipelineApi.listRuns(workspace.currentProjectId); } catch {}
}

function selectPipeline(p: Pipeline) {
  selectedPipeline.value = p;
  inputValues.value = {};
  expandedStages.value = new Set(p.stages.map(s => s.id));
  for (const input of p.inputs || []) inputValues.value[input.key] = input.default ?? '';
  view.value = 'detail';
}
function toggleStage(stageId: string) {
  if (expandedStages.value.has(stageId)) expandedStages.value.delete(stageId);
  else expandedStages.value.add(stageId);
}

// ─── 执行 ────────────────────────────────────────────────────
async function startRun() {
  if (!selectedPipeline.value || !workspace.currentProjectId) return;
  isLoading.value = true; error.value = '';
  try {
    const result = await pipelineApi.run(selectedPipeline.value.name, workspace.currentProjectId, inputValues.value);
    workspace.addTaskLog('pipeline', 'running', `流水线启动: ${selectedPipeline.value.displayName}`);
    await loadRunDetail(result.runId);
    view.value = 'run'; startPolling();
  } catch (e: any) { error.value = e.message; }
  isLoading.value = false;
}
async function loadRunDetail(runId: string) {
  if (!workspace.currentProjectId) return;
  try { activeRun.value = await pipelineApi.getRun(workspace.currentProjectId, runId); } catch (e: any) { error.value = e.message; }
}
async function viewRun(run: PipelineRunSummary) {
  await loadRunDetail(run.id); view.value = 'run';
  if (run.status === 'running' || run.status === 'paused') startPolling();
}
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!activeRun.value) return;
    await loadRunDetail(activeRun.value.id);
    if (activeRun.value && ['success', 'failed', 'cancelled'].includes(activeRun.value.status)) {
      stopPolling(); workspace.addTaskLog('pipeline', activeRun.value.status, `流水线完成: ${activeRun.value.pipelineDisplayName}`); await loadRuns();
    }
  }, 2000);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
async function pauseRun() { if (!activeRun.value) return; await pipelineApi.pause(activeRun.value.id); await loadRunDetail(activeRun.value.id); }
async function resumeRun() { if (!activeRun.value) return; await pipelineApi.resume(activeRun.value.id); await loadRunDetail(activeRun.value.id); }
async function cancelRun() { if (!activeRun.value) return; await pipelineApi.cancel(activeRun.value.id); stopPolling(); await loadRunDetail(activeRun.value.id); await loadRuns(); }
async function deleteRunRecord(run: PipelineRunSummary) { if (!workspace.currentProjectId) return; await pipelineApi.deleteRun(workspace.currentProjectId, run.id); await loadRuns(); }

async function continueRun(run: PipelineRunSummary) {
  if (!workspace.currentProjectId) return;
  isLoading.value = true; error.value = '';
  try {
    await pipelineApi.continue(workspace.currentProjectId, run.id);
    workspace.addTaskLog('pipeline', 'running', `流水线继续执行: ${run.pipelineDisplayName}`);
    await loadRunDetail(run.id);
    view.value = 'run'; startPolling();
  } catch (e: any) { error.value = e.message; }
  isLoading.value = false;
}

async function continueActiveRun() {
  if (!activeRun.value || !workspace.currentProjectId) return;
  isLoading.value = true; error.value = '';
  try {
    await pipelineApi.continue(workspace.currentProjectId, activeRun.value.id);
    workspace.addTaskLog('pipeline', 'running', `流水线继续执行: ${activeRun.value.pipelineDisplayName}`);
    startPolling();
    await loadRunDetail(activeRun.value.id);
  } catch (e: any) { error.value = e.message; }
  isLoading.value = false;
}

// ─── 创建/编辑/删除 ──────────────────────────────────────────
function createNew() { resetEditForm(); view.value = 'editor'; }
function editPipeline(p: Pipeline) { pipelineToForm(p); editError.value = ''; view.value = 'editor'; }
function duplicatePipeline(p: Pipeline) {
  pipelineToForm(p);
  editForm.name = p.name + '-copy';
  editForm.displayName = p.displayName + '（副本）';
  editError.value = '';
  view.value = 'editor';
}
async function saveEdit() {
  editError.value = '';
  if (!editForm.name.trim()) { editError.value = '请填写流水线 ID（英文）'; return; }
  if (!editForm.displayName.trim()) { editError.value = '请填写显示名称'; return; }
  if (!editForm.stages.length) { editError.value = '至少添加一个阶段'; return; }
  for (const s of editForm.stages) {
    if (!s.name.trim()) { editError.value = `阶段 "${s.id}" 缺少名称`; return; }
    if (!s.steps.length) { editError.value = `阶段 "${s.name}" 至少需要一个步骤`; return; }
    for (const st of s.steps) {
      if (!st.action) { editError.value = `步骤 "${st.name || st.id}" 缺少 Action`; return; }
    }
  }
  try {
    const pipeline = formToPipeline();
    await pipelineApi.save(pipeline, 'project', workspace.currentProjectId);
    workspace.addTaskLog('pipeline', 'success', `流水线已保存: ${pipeline.displayName}`);
    await loadPipelines(); view.value = 'list';
  } catch (e: any) { editError.value = e.message; }
}
async function deletePipeline(p: Pipeline) {
  if (!confirm(`确定删除「${p.displayName}」？`)) return;
  try { await pipelineApi.delete(p.name, (p as any).source || 'project', workspace.currentProjectId); await loadPipelines(); } catch (e: any) { error.value = e.message; }
}
function goBack() { stopPolling(); activeRun.value = null; selectedPipeline.value = null; view.value = 'list'; }

// ─── 辅助 ────────────────────────────────────────────────────
const statusIcons: Record<string, string> = { pending: '⏳', running: '▶', paused: '⏸', success: '✓', failed: '✗', cancelled: '⊘', skipped: '⊘' };
const statusColors: Record<string, string> = { pending: 'var(--text-muted)', running: 'var(--accent)', paused: 'var(--warning)', success: 'var(--success)', failed: 'var(--danger)', cancelled: 'var(--text-muted)' };
const statusLabels: Record<string, string> = { pending: '等待中', running: '运行中', paused: '已暂停', success: '已完成', failed: '已失败', cancelled: '已取消' };
const totalSteps = computed(() => activeRun.value ? activeRun.value.stages.reduce((s, st) => s + st.steps.length, 0) : 0);
const completedSteps = computed(() => activeRun.value ? activeRun.value.stages.reduce((s, st) => s + st.steps.filter(x => x.status === 'success').length, 0) : 0);
function getActionLabel(action: string) { return AVAILABLE_ACTIONS.find(a => a.action === action)?.label || action; }
function canContinue(run: PipelineRunSummary) { return ['paused', 'failed', 'running'].includes(run.status) && !run.completedAt; }
function formatDuration(start: string | null, end: string | null) {
  if (!start) return '';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.round((e - s) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`;
}

onMounted(async () => { await loadPipelines(); await loadRuns(); });
onUnmounted(() => stopPolling());
</script>

<template>
  <div class="pipeline-pane">
    <!-- 头部 -->
    <div class="pane-header">
      <button v-if="view !== 'list'" class="back-btn" @click="goBack">← 返回</button>
      <h3 v-if="view === 'list'">🔗 工作流管线</h3>
      <h3 v-else-if="view === 'detail'">{{ selectedPipeline?.displayName }}</h3>
      <h3 v-else-if="view === 'run'">{{ activeRun?.pipelineDisplayName }}</h3>
      <h3 v-else-if="view === 'editor'">{{ editForm.name ? '编辑流水线' : '新建流水线' }}</h3>
      <span class="spacer"></span>
      <button v-if="view === 'list'" class="header-action" @click="createNew">＋ 新建</button>
    </div>

    <div v-if="error" class="error-bar">
      <span>⚠️ {{ error }}</span><button @click="error = ''">✕</button>
    </div>

    <!-- ═══ 列表视图 ═══ -->
    <div v-if="view === 'list'" class="pane-body">
      <div v-if="!pipelines.length && !runs.length" class="empty-state">
        <div class="empty-icon">🔗</div>
        <p class="empty-title">暂无工作流</p>
        <p class="empty-desc">创建流水线，将各步骤串接为自动化流程</p>
        <button class="create-btn" @click="createNew">＋ 新建流水线</button>
      </div>

      <div v-if="pipelines.length" class="section">
        <div class="section-title">流水线</div>
        <div class="pipeline-list">
          <div v-for="p in pipelines" :key="p.name" class="pipeline-card">
            <div class="card-main" @click="selectPipeline(p)">
              <div class="card-header">
                <span class="card-name">{{ p.displayName || p.name }}</span>
                <span class="card-source">{{ (p as any).source || 'project' }}</span>
              </div>
              <div class="card-desc" v-if="p.description">{{ p.description }}</div>
              <div class="card-meta">
                <span>{{ p.stages.length }} 阶段</span>
                <span>{{ p.stages.reduce((s, st) => s + st.steps.length, 0) }} 步骤</span>
              </div>
            </div>
            <div class="card-actions">
              <button @click.stop="duplicatePipeline(p)" title="复制为新流水线">📋</button>
              <button @click.stop="editPipeline(p)" title="编辑">✎</button>
              <button v-if="(p as any).source !== 'builtin'" @click.stop="deletePipeline(p)" title="删除">🗑</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="runs.length" class="section">
        <div class="section-title">执行记录</div>
        <div class="run-list">
          <div v-for="r in runs" :key="r.id" class="run-item" @click="viewRun(r)">
            <span class="run-status" :style="{ color: statusColors[r.status] }">{{ statusIcons[r.status] }}</span>
            <div class="run-info">
              <div class="run-info-top">
                <span class="run-name">{{ r.pipelineDisplayName }}</span>
                <span class="run-status-label" :style="{ color: statusColors[r.status] }">{{ statusLabels[r.status] || r.status }}</span>
              </div>
              <div class="run-info-bottom">
                <span class="run-progress">阶段 {{ r.currentStageIndex + 1 }}/{{ r.totalStages }}</span>
                <span class="run-time">{{ new Date(r.createdAt).toLocaleString() }}</span>
                <span v-if="r.startedAt" class="run-duration">耗时 {{ formatDuration(r.startedAt, r.completedAt) }}</span>
              </div>
            </div>
            <div class="run-item-actions">
              <button v-if="canContinue(r)" class="run-continue" @click.stop="continueRun(r)" title="继续执行">▶</button>
              <button class="run-delete" @click.stop="deleteRunRecord(r)" title="删除">🗑</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 详情视图 ═══ -->
    <div v-if="view === 'detail' && selectedPipeline" class="pane-body">
      <p class="detail-desc" v-if="selectedPipeline.description">{{ selectedPipeline.description }}</p>

      <!-- 参数输入 + 运行按钮放最上面 -->
      <div class="run-section">
        <div v-if="selectedPipeline.inputs?.length" class="inputs-row">
          <div v-for="input in selectedPipeline.inputs" :key="input.key" class="input-field-inline">
            <label>{{ input.label }}{{ input.required ? ' *' : '' }}</label>
            <input v-if="input.type === 'number'" type="number" v-model.number="inputValues[input.key]" :placeholder="String(input.default || '')" />
            <input v-else type="text" v-model="inputValues[input.key]" :placeholder="String(input.default || '')" />
          </div>
        </div>
        <div class="detail-actions">
          <button class="start-btn" @click="startRun" :disabled="isLoading">{{ isLoading ? '启动中...' : '▶ 启动流水线' }}</button>
          <button class="edit-btn" @click="duplicatePipeline(selectedPipeline)">📋 复制编辑</button>
          <button class="edit-btn" @click="editPipeline(selectedPipeline)">✎ 编辑</button>
        </div>
      </div>

      <!-- 阶段/步骤详情 -->
      <div class="section-title" style="margin-top: 16px;">阶段 & 步骤</div>
      <div class="stages-tree">
        <div v-for="(stage, si) in selectedPipeline.stages" :key="stage.id" class="stage-block">
          <div class="stage-header" @click="toggleStage(stage.id)">
            <span class="arrow">{{ expandedStages.has(stage.id) ? '▾' : '▸' }}</span>
            <span class="stage-index">{{ si + 1 }}</span>
            <span class="stage-name">{{ stage.name }}</span>
            <span class="stage-badge">{{ stage.steps.length }} 步骤</span>
          </div>
          <div v-if="(stage as any).description && expandedStages.has(stage.id)" class="stage-desc">{{ (stage as any).description }}</div>
          <div v-show="expandedStages.has(stage.id)" class="steps-tree">
            <div v-for="(step, sti) in stage.steps" :key="step.id" class="step-block">
              <div class="step-header">
                <span class="step-index">{{ si + 1 }}.{{ sti + 1 }}</span>
                <span class="step-name">{{ step.name }}</span>
              </div>
              <div class="step-details">
                <div class="detail-row"><span class="detail-label">Action</span><span class="detail-value action-tag">{{ getActionLabel(step.action) }}</span></div>
                <div v-if="step.loop" class="detail-row"><span class="detail-label">循环</span><span class="detail-value">{{ step.loop.type === 'batch' ? '批量' : '顺序' }} · {{ step.loop.from }} → {{ step.loop.to }}</span></div>
                <div v-if="step.dependsOn?.length" class="detail-row"><span class="detail-label">依赖</span><span class="detail-value">{{ step.dependsOn.join(', ') }}</span></div>
                <div v-if="Object.keys(step.params || {}).length" class="detail-row"><span class="detail-label">参数</span><span class="detail-value mono">{{ JSON.stringify(step.params) }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 可视化编辑器 ═══ -->
    <div v-if="view === 'editor'" class="pane-body">
      <div class="editor-form">
        <!-- 基本信息 -->
        <div class="form-group">
          <label>流水线 ID <span class="hint">（英文，唯一标识）</span></label>
          <input v-model="editForm.name" placeholder="my-pipeline" />
        </div>
        <div class="form-group">
          <label>显示名称</label>
          <input v-model="editForm.displayName" placeholder="我的流水线" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <input v-model="editForm.description" placeholder="这条流水线做什么..." />
        </div>

        <!-- 阶段列表 -->
        <div class="form-section-title">
          <span>阶段 (Stages)</span>
          <button class="add-btn" @click="addStage">＋ 添加阶段</button>
        </div>

        <div class="stages-editor">
          <div v-for="(stage, si) in editForm.stages" :key="si" class="stage-edit-block">
            <div class="stage-edit-header" @click="toggleEditStage(si)">
              <span class="arrow">{{ editExpandedStages.has(si) ? '▾' : '▸' }}</span>
              <span class="stage-num">{{ si + 1 }}</span>
              <input v-model="stage.name" placeholder="阶段名称" class="inline-input stage-name-input" @click.stop />
              <span class="step-count">{{ stage.steps.length }} 步骤</span>
              <button class="remove-btn" @click.stop="removeStage(si)" title="删除阶段">✕</button>
            </div>

            <div v-show="editExpandedStages.has(si)" class="stage-edit-body">
              <div class="form-group small">
                <label>阶段 ID</label>
                <input v-model="stage.id" placeholder="stage-id" />
              </div>
              <div class="form-group small">
                <label>描述</label>
                <input v-model="stage.description" placeholder="这个阶段做什么..." />
              </div>

              <!-- 步骤列表 -->
              <div class="steps-editor">
                <div class="steps-title">
                  <span>步骤 (Steps)</span>
                  <button class="add-btn small" @click="addStep(si)">＋ 步骤</button>
                </div>

                <div v-for="(step, sti) in stage.steps" :key="sti" class="step-edit-block">
                  <div class="step-edit-row">
                    <span class="step-num">{{ si + 1 }}.{{ sti + 1 }}</span>
                    <input v-model="step.name" placeholder="步骤名称" class="inline-input" />
                    <button class="remove-btn small" @click="removeStep(si, sti)">✕</button>
                  </div>
                  <div class="step-edit-fields">
                    <div class="field-row">
                      <label>Action</label>
                      <select v-model="step.action">
                        <option value="">-- 选择 --</option>
                        <option v-for="a in AVAILABLE_ACTIONS" :key="a.action" :value="a.action">{{ a.label }}</option>
                      </select>
                    </div>
                    <div class="field-row">
                      <label>ID</label>
                      <input v-model="step.id" placeholder="step-id" />
                    </div>
                    <div class="field-row">
                      <label>参数 (JSON)</label>
                      <input v-model="step.paramsJson" placeholder='{"chapterNumber": "{{loop.current}}"}' />
                    </div>
                    <div class="field-row">
                      <label>依赖步骤</label>
                      <input v-model="step.dependsOn" placeholder="step-id1, step-id2" />
                    </div>
                    <div class="field-row">
                      <label>循环类型</label>
                      <select v-model="step.loopType">
                        <option value="">无循环</option>
                        <option value="sequential">顺序 (逐个)</option>
                        <option value="batch">批量</option>
                      </select>
                    </div>
                    <template v-if="step.loopType">
                      <div class="field-row">
                        <label>从</label>
                        <input v-model="step.loopFrom" placeholder="{{input.startChapter}}" />
                      </div>
                      <div class="field-row">
                        <label>到</label>
                        <input v-model="step.loopTo" placeholder="{{input.endChapter}}" />
                      </div>
                      <div v-if="step.loopType === 'batch'" class="field-row">
                        <label>批次大小</label>
                        <input type="number" v-model.number="step.loopBatchSize" />
                      </div>
                    </template>
                    <div class="field-row checkbox-row">
                      <label><input type="checkbox" v-model="step.continueOnError" /> 失败时继续</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入参数 & 设置（高级，用 JSON） -->
        <details class="advanced-section">
          <summary>高级：输入参数 & 运行设置</summary>
          <div class="form-group">
            <label>输入参数定义 (JSON 数组)</label>
            <textarea v-model="editForm.inputsJson" rows="4" class="json-input" placeholder='[{"key":"startChapter","label":"起始章节","type":"number","default":1}]'></textarea>
          </div>
          <div class="form-group">
            <label>运行设置 (JSON)</label>
            <textarea v-model="editForm.settingsJson" rows="3" class="json-input" placeholder='{"pauseBetweenStages":false,"maxRetries":1}'></textarea>
          </div>
        </details>

        <div v-if="editError" class="edit-error">⚠️ {{ editError }}</div>

        <div class="editor-actions">
          <button class="save-btn" @click="saveEdit">💾 保存</button>
          <button class="cancel-btn" @click="goBack">取消</button>
        </div>
      </div>
    </div>

    <!-- ═══ 执行视图 ═══ -->
    <div v-if="view === 'run' && activeRun" class="pane-body">
      <div class="run-header">
        <div class="run-overall">
          <span class="run-status-badge" :style="{ color: statusColors[activeRun.status] }">{{ statusIcons[activeRun.status] }} {{ activeRun.status }}</span>
          <span class="run-progress-text">{{ completedSteps }}/{{ totalSteps }} 步骤</span>
        </div>
        <div class="run-controls">
          <button v-if="activeRun.status === 'running'" @click="pauseRun" class="ctrl-btn">⏸ 暂停</button>
          <button v-if="activeRun.status === 'paused'" @click="resumeRun" class="ctrl-btn accent">▶ 恢复</button>
          <button v-if="activeRun.status === 'failed'" @click="continueActiveRun" class="ctrl-btn accent" :disabled="isLoading">🔄 继续</button>
          <button v-if="['running','paused'].includes(activeRun.status)" @click="cancelRun" class="ctrl-btn danger">✕ 取消</button>
        </div>
      </div>
      <div class="stages-progress">
        <div v-for="stage in activeRun.stages" :key="stage.id" class="stage-prog-block">
          <div class="stage-prog-header">
            <span class="stage-icon" :style="{ color: statusColors[stage.status] }">{{ statusIcons[stage.status] }}</span>
            <span class="stage-title">{{ stage.name }}</span>
          </div>
          <div class="steps-prog-list">
            <div v-for="step in stage.steps" :key="step.id" class="step-prog-row">
              <span class="step-icon" :style="{ color: statusColors[step.status] }">{{ statusIcons[step.status] }}</span>
              <span class="step-prog-name">{{ step.name }}</span>
              <span v-if="step.loopProgress" class="step-loop">{{ step.loopProgress.current || '-' }}/{{ step.loopProgress.total || '?' }}</span>
              <span v-if="step.error" class="step-error" :title="step.error">⚠️</span>
            </div>
          </div>
        </div>
      </div>
      <div class="run-logs">
        <div class="section-title">执行日志 <span class="log-count">({{ activeRun.logs.length }})</span></div>
        <div class="logs-body">
          <div v-for="(log, i) in activeRun.logs.slice(-50)" :key="i" class="log-line" :class="log.level">
            <span class="log-time">{{ log.time.split('T')[1]?.slice(0, 8) }}</span>
            <span class="log-level-badge">{{ log.level === 'error' ? '✗' : log.level === 'warn' ? '⚠' : log.level === 'step' ? '→' : '·' }}</span>
            <span class="log-msg">{{ log.message }}</span>
          </div>
          <div v-if="!activeRun.logs.length" class="log-empty">暂无日志</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline-pane { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.pane-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.pane-header h3 { font-size: 14px; font-weight: 600; margin: 0; }
.spacer { flex: 1; }
.back-btn { font-size: 12px; opacity: 0.7; padding: 2px 6px; border-radius: 4px; }
.back-btn:hover { opacity: 1; background: var(--bg-overlay); }
.header-action { font-size: 11px; padding: 3px 8px; border-radius: 4px; background: var(--accent); color: #fff; }
.header-action:hover { background: var(--accent-hover); }

.error-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 16px; background: rgba(224,82,82,0.1); border-bottom: 1px solid rgba(224,82,82,0.3); font-size: 12px; color: var(--danger); }
.error-bar button { opacity: 0.6; } .error-bar button:hover { opacity: 1; }

.pane-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.section { margin-bottom: 20px; }
.section-title { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }

/* 空状态 */
.empty-state { display: flex; flex-direction: column; align-items: center; padding-top: 60px; text-align: center; gap: 8px; }
.empty-icon { font-size: 40px; opacity: 0.5; }
.empty-title { font-size: 14px; font-weight: 600; margin: 0; }
.empty-desc { font-size: 12px; color: var(--text-muted); max-width: 280px; line-height: 1.5; margin: 0; }
.create-btn { margin-top: 12px; padding: 5px 12px; background: var(--accent); color: #fff; border-radius: 4px; font-size: 11px; }

/* 列表卡片 */
.pipeline-list { display: flex; flex-direction: column; gap: 8px; }
.pipeline-card { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.pipeline-card:hover { border-color: var(--accent); }
.card-main { flex: 1; padding: 10px 12px; cursor: pointer; }
.card-main:hover { background: var(--accent-dim); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.card-name { font-size: 13px; font-weight: 500; }
.card-source { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: var(--bg-overlay); color: var(--text-muted); }
.card-desc { font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
.card-meta { display: flex; gap: 12px; font-size: 11px; color: var(--text-muted); }
.card-actions { display: flex; flex-direction: column; border-left: 1px solid var(--border); }
.card-actions button { flex: 1; padding: 0 8px; font-size: 11px; opacity: 0.5; }
.card-actions button:hover { opacity: 1; background: var(--bg-overlay); }

/* 执行记录 */
.run-list { display: flex; flex-direction: column; gap: 6px; }
.run-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 12px; border: 1px solid var(--border); }
.run-item:hover { background: var(--bg-overlay); border-color: var(--accent); }
.run-status { font-weight: 700; width: 16px; font-size: 14px; flex-shrink: 0; }
.run-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.run-info-top { display: flex; align-items: center; gap: 8px; }
.run-name { font-weight: 500; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.run-status-label { font-size: 10px; font-weight: 600; flex-shrink: 0; }
.run-info-bottom { display: flex; align-items: center; gap: 10px; font-size: 10px; color: var(--text-muted); }
.run-progress { padding: 1px 5px; border-radius: 3px; background: var(--bg-overlay); border: 1px solid var(--border); }
.run-time { white-space: nowrap; }
.run-duration { white-space: nowrap; }
.run-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.run-continue { font-size: 11px; padding: 3px 8px; border-radius: 4px; background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); opacity: 0.8; }
.run-continue:hover { background: var(--accent); color: #fff; opacity: 1; }
.run-delete { opacity: 0; font-size: 11px; padding: 3px 6px; border-radius: 4px; }
.run-item:hover .run-delete { opacity: 0.5; }
.run-delete:hover { opacity: 1; background: rgba(224,82,82,0.15); color: var(--danger); }

/* 详情视图 */
.detail-desc { font-size: 13px; color: var(--text-dim); line-height: 1.5; margin: 0 0 12px; }

.run-section { padding: 10px 12px; background: var(--bg-overlay); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; }
.inputs-row { display: flex; flex-wrap: wrap; gap: 8px; }
.input-field-inline { display: flex; flex-direction: column; gap: 2px; min-width: 100px; flex: 1; }
.input-field-inline label { font-size: 10px; color: var(--text-muted); }
.input-field-inline input { padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-surface); color: var(--text); font-size: 11px; }
.input-field-inline input:focus { border-color: var(--accent); outline: none; }

.detail-actions { display: flex; gap: 6px; }
.start-btn { padding: 5px 12px; background: var(--accent); color: #fff; border-radius: 4px; font-size: 11px; font-weight: 500; }
.start-btn:hover { background: var(--accent-hover); }
.start-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.edit-btn { padding: 5px 10px; border: 1px solid var(--border); border-radius: 4px; font-size: 11px; }
.edit-btn:hover { background: var(--bg-overlay); }

.stages-tree { display: flex; flex-direction: column; gap: 2px; margin-bottom: 16px; }
.stage-block { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.stage-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; font-size: 13px; background: var(--bg-overlay); }
.stage-header:hover { background: var(--border); }
.stage-header .arrow { font-size: 10px; width: 12px; color: var(--text-muted); }
.stage-index { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--accent); color: #fff; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.stage-name { font-weight: 500; flex: 1; }
.stage-badge { font-size: 10px; color: var(--text-muted); padding: 1px 6px; border: 1px solid var(--border); border-radius: 3px; }
.stage-desc { padding: 4px 12px 4px 50px; font-size: 11px; color: var(--text-muted); background: var(--bg-overlay); border-bottom: 1px solid var(--border); }
.steps-tree { padding: 8px 12px 8px 24px; display: flex; flex-direction: column; gap: 8px; }
.step-block { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-surface); }
.step-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.step-index { font-size: 10px; color: var(--accent); font-weight: 600; font-family: monospace; }
.step-name { font-size: 12px; font-weight: 500; }
.step-details { display: flex; flex-direction: column; gap: 3px; }
.detail-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.detail-label { color: var(--text-muted); min-width: 40px; }
.detail-value { color: var(--text-dim); }
.detail-value.action-tag { color: var(--accent); font-weight: 500; }
.detail-value.mono { font-family: monospace; font-size: 10px; }

/* ═══ 可视化编辑器 ═══ */
.editor-form { display: flex; flex-direction: column; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: 12px; color: var(--text-dim); font-weight: 500; }
.form-group label .hint { font-weight: 400; color: var(--text-muted); }
.form-group input, .form-group textarea, .form-group select {
  padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-overlay); color: var(--text); font-size: 12px;
}
.form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: var(--accent); outline: none; }
.form-group.small { margin-bottom: 4px; }
.form-group.small label { font-size: 11px; }
.form-group.small input { padding: 4px 8px; font-size: 11px; }

.form-section-title { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
.form-section-title span { font-size: 12px; font-weight: 600; color: var(--text); }
.add-btn { font-size: 10px; padding: 2px 6px; border-radius: 3px; background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); }
.add-btn:hover { background: var(--accent); color: #fff; }
.add-btn.small { font-size: 10px; padding: 2px 5px; }

.stages-editor { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.stage-edit-block { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.stage-edit-header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: var(--bg-overlay); cursor: pointer; }
.stage-edit-header .arrow { font-size: 10px; width: 12px; color: var(--text-muted); }
.stage-num { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--accent); color: #fff; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.inline-input { border: none; background: transparent; color: var(--text); font-size: 12px; padding: 2px 4px; border-bottom: 1px dashed var(--border); flex: 1; min-width: 0; }
.inline-input:focus { border-bottom-color: var(--accent); outline: none; }
.stage-name-input { font-weight: 500; }
.step-count { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.remove-btn { font-size: 12px; opacity: 0.4; padding: 2px 6px; border-radius: 3px; flex-shrink: 0; }
.remove-btn:hover { opacity: 1; background: rgba(224,82,82,0.15); color: var(--danger); }
.remove-btn.small { font-size: 10px; }

.stage-edit-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }

.steps-editor { margin-top: 4px; }
.steps-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.steps-title span { font-size: 11px; font-weight: 600; color: var(--text-dim); }

.step-edit-block { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; background: var(--bg-surface); }
.step-edit-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.step-num { font-size: 10px; color: var(--accent); font-weight: 600; font-family: monospace; flex-shrink: 0; }

.step-edit-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.field-row { display: flex; flex-direction: column; gap: 2px; }
.field-row label { font-size: 10px; color: var(--text-muted); }
.field-row input, .field-row select { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-overlay); color: var(--text); font-size: 11px; }
.field-row input:focus, .field-row select:focus { border-color: var(--accent); outline: none; }
.checkbox-row { flex-direction: row; align-items: center; }
.checkbox-row label { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-dim); cursor: pointer; }

.advanced-section { margin-top: 8px; }
.advanced-section summary { font-size: 12px; color: var(--text-muted); cursor: pointer; padding: 4px 0; }
.advanced-section summary:hover { color: var(--text); }
.json-input { font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.4; resize: vertical; min-height: 60px; }

.edit-error { font-size: 12px; color: var(--danger); padding: 4px 0; }
.editor-actions { display: flex; gap: 8px; margin-top: 4px; }
.save-btn { padding: 5px 14px; background: var(--accent); color: #fff; border-radius: 4px; font-size: 11px; font-weight: 500; }
.save-btn:hover { background: var(--accent-hover); }
.cancel-btn { padding: 5px 12px; border: 1px solid var(--border); border-radius: 4px; font-size: 11px; }
.cancel-btn:hover { background: var(--bg-overlay); }

/* ═══ 执行视图 ═══ */
.run-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-overlay); border-radius: 8px; margin-bottom: 12px; }
.run-overall { display: flex; align-items: center; gap: 12px; }
.run-status-badge { font-size: 13px; font-weight: 600; }
.run-progress-text { font-size: 12px; color: var(--text-muted); }
.run-controls { display: flex; gap: 6px; }
.ctrl-btn { padding: 3px 8px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border); background: var(--bg-surface); }
.ctrl-btn:hover { background: var(--bg-overlay); }
.ctrl-btn.accent { border-color: var(--accent); color: var(--accent); }
.ctrl-btn.danger { border-color: var(--danger); color: var(--danger); }

.stages-progress { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.stage-prog-block { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.stage-prog-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-overlay); font-size: 12px; font-weight: 500; }
.stage-icon { font-weight: 700; }
.stage-title { flex: 1; }
.steps-prog-list { padding: 6px 12px; }
.step-prog-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11px; }
.step-icon { width: 14px; font-weight: 700; }
.step-prog-name { flex: 1; }
.step-loop { color: var(--accent); font-size: 10px; }
.step-error { cursor: help; }

.run-logs { border-top: 1px solid var(--border); padding-top: 12px; }
.log-count { font-weight: 400; color: var(--text-muted); }
.logs-body { max-height: 280px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; padding: 4px 0; }
.log-line { display: flex; gap: 6px; padding: 2px 0; font-size: 10px; line-height: 1.5; }
.log-line.info .log-msg { color: var(--text-dim); }
.log-line.warn .log-msg { color: var(--warning); }
.log-line.error .log-msg { color: var(--danger); }
.log-line.step .log-msg { color: var(--accent); }
.log-time { color: var(--text-muted); flex-shrink: 0; font-size: 9px; opacity: 0.7; }
.log-level-badge { flex-shrink: 0; width: 10px; text-align: center; }
.log-msg { word-break: break-all; }
.log-empty { color: var(--text-muted); font-size: 11px; padding: 8px 0; text-align: center; }
</style>
