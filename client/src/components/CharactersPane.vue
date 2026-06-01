<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useWorkspace } from '../stores/workspace';
import { api, type CharacterCard } from '../api';

const workspace = useWorkspace();
const characters = ref<CharacterCard[]>([]);
const saving = ref(false);
const expandedIdx = ref<number | null>(null);

async function loadCharacters() {
  if (!workspace.currentProjectId) return;
  characters.value = await api.getCharacters(workspace.currentProjectId);
}

async function save() {
  if (!workspace.currentProjectId) return;
  saving.value = true;
  try {
    await api.updateCharacters(workspace.currentProjectId, characters.value);
    workspace.addTaskLog('characters', 'success', '角色卡已保存');
  } finally {
    saving.value = false;
  }
}

function addCharacter() {
  characters.value.push({
    name: '',
    role: 'supporting',
    gender: '',
    age: '',
    appearance: '',
    personality: '',
    background: '',
    abilities: '',
    motivation: '',
    relationships: '',
    arc: '',
    notes: '',
    currentState: {
      location: '',
      powerLevel: '',
      physicalState: '正常',
      mentalState: '正常',
      keyItems: '',
      recentEvents: '',
      updatedAtChapter: 0,
    },
  });
  expandedIdx.value = characters.value.length - 1;
}

function removeCharacter(idx: number) {
  characters.value.splice(idx, 1);
  expandedIdx.value = null;
}

function toggleExpand(idx: number) {
  expandedIdx.value = expandedIdx.value === idx ? null : idx;
}

const roleLabels: Record<string, string> = {
  protagonist: '主角',
  antagonist: '反派',
  supporting: '配角',
  minor: '龙套',
};

onMounted(loadCharacters);
watch(() => workspace.currentProjectId, loadCharacters);
</script>

<template>
  <div class="characters-pane">
    <div class="pane-header">
      <h2>角色卡管理</h2>
      <p class="desc">管理角色档案与动态状态追踪</p>
      <div class="actions">
        <button class="btn btn-outline" @click="addCharacter">＋ 添加角色</button>
        <button class="btn btn-primary" @click="save" :disabled="saving">
          💾 {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <div v-if="!characters.length" class="empty">
      <p>暂无角色卡。可以手动添加，或在生成架构时自动提取。</p>
    </div>

    <div v-for="(char, idx) in characters" :key="idx" class="character-card">
      <div class="card-header" @click="toggleExpand(idx)">
        <span class="card-role-badge" :class="char.role">{{ roleLabels[char.role] || char.role }}</span>
        <input
          v-model="char.name"
          class="card-name-input"
          placeholder="角色名"
          @click.stop
        />
        <span class="expand-arrow">{{ expandedIdx === idx ? '▾' : '▸' }}</span>
        <button class="remove-btn" @click.stop="removeCharacter(idx)">✕</button>
      </div>

      <div v-show="expandedIdx === idx" class="card-body">
        <div class="card-grid">
          <div class="field">
            <label>角色定位</label>
            <select v-model="char.role">
              <option value="protagonist">主角</option>
              <option value="antagonist">反派</option>
              <option value="supporting">配角</option>
              <option value="minor">龙套</option>
            </select>
          </div>
          <div class="field">
            <label>性别</label>
            <input v-model="char.gender" placeholder="性别" />
          </div>
          <div class="field">
            <label>年龄</label>
            <input v-model="char.age" placeholder="年龄/阶段" />
          </div>
        </div>

        <div class="field">
          <label>外貌特征</label>
          <textarea v-model="char.appearance" rows="2" placeholder="标志性外貌描写..."></textarea>
        </div>
        <div class="field">
          <label>性格特点</label>
          <textarea v-model="char.personality" rows="2" placeholder="核心性格特质..."></textarea>
        </div>
        <div class="field">
          <label>背景故事</label>
          <textarea v-model="char.background" rows="2" placeholder="角色背景..."></textarea>
        </div>
        <div class="field">
          <label>能力/技能</label>
          <input v-model="char.abilities" placeholder="能力体系..." />
        </div>
        <div class="field">
          <label>核心动机</label>
          <input v-model="char.motivation" placeholder="驱动角色行动的核心诉求..." />
        </div>
        <div class="field">
          <label>人物关系</label>
          <input v-model="char.relationships" placeholder="与其他角色的关系..." />
        </div>
        <div class="field">
          <label>角色弧光</label>
          <input v-model="char.arc" placeholder="预期的成长轨迹..." />
        </div>

        <!-- 动态状态 -->
        <div class="state-section">
          <h4>📍 当前状态（动态追踪）</h4>
          <div class="card-grid">
            <div class="field">
              <label>位置</label>
              <input v-model="char.currentState!.location" placeholder="当前位置" />
            </div>
            <div class="field">
              <label>能力等级</label>
              <input v-model="char.currentState!.powerLevel" placeholder="境界/等级" />
            </div>
            <div class="field">
              <label>身体状态</label>
              <input v-model="char.currentState!.physicalState" placeholder="伤势/BUFF" />
            </div>
            <div class="field">
              <label>心理状态</label>
              <input v-model="char.currentState!.mentalState" placeholder="心态/情绪" />
            </div>
            <div class="field">
              <label>关键道具</label>
              <input v-model="char.currentState!.keyItems" placeholder="持有道具" />
            </div>
            <div class="field">
              <label>近期事件</label>
              <input v-model="char.currentState!.recentEvents" placeholder="最近发生的事" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.characters-pane { padding: 24px 32px; max-width: 860px; margin: 0 auto; overflow-y: auto; height: 100%; }
.pane-header { margin-bottom: 20px; }
.pane-header h2 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.desc { color: var(--text-muted); font-size: 13px; margin-bottom: 12px; }
.actions { display: flex; gap: 8px; }
.btn { padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; }
.btn-primary { background: var(--accent); color: var(--bg-overlay); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; }
.btn-outline { border: 1px solid var(--border); color: var(--text-dim); }
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }

.empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; }

.character-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
.card-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer; }
.card-header:hover { background: rgba(255,255,255,0.02); }
.card-role-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
.card-role-badge.protagonist { background: var(--accent-dim); color: var(--accent); }
.card-role-badge.antagonist { background: rgba(224,82,82,0.15); color: var(--danger); }
.card-role-badge.supporting { background: rgba(92,184,92,0.15); color: var(--success); }
.card-role-badge.minor { background: var(--bg-overlay); color: var(--text-muted); }
.card-name-input { flex: 1; background: transparent; border: none; font-size: 14px; font-weight: 600; color: var(--text); padding: 0; }
.card-name-input:focus { outline: none; border-bottom: 1px solid var(--accent); }
.expand-arrow { font-size: 10px; color: var(--text-muted); }
.remove-btn { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--danger); font-size: 12px; opacity: 0; }
.card-header:hover .remove-btn { opacity: 0.6; }
.remove-btn:hover { opacity: 1 !important; background: rgba(224,82,82,0.1); }

.card-body { padding: 12px 14px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; }
.card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.field { display: flex; flex-direction: column; gap: 3px; }
.field label { font-size: 11px; color: var(--text-dim); font-weight: 500; }
.field input, .field select, .field textarea { font-size: 12px; padding: 5px 8px; }
.field textarea { resize: vertical; min-height: 40px; }

.state-section { margin-top: 8px; padding-top: 10px; border-top: 1px dashed var(--border); }
.state-section h4 { font-size: 12px; font-weight: 600; margin-bottom: 8px; color: var(--text-dim); }
</style>
