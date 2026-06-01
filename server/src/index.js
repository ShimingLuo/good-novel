import express from 'express';
import cors from 'cors';
import { PORT, PROJECTS_ROOT } from './config.js';
import projectsRouter from './routes/projects.js';
import chatRouter from './routes/chat.js';
import workflowRouter from './routes/workflow.js';
import agentRouter from './routes/agent.js';
import skillsRouter from './routes/skills.js';
import promptsRouter from './routes/prompts.js';
import settingsRouter from './routes/settings.js';
import pipelinesRouter from './routes/pipelines.js';
import promptSetsRouter from './routes/prompt-sets.js';
import skillSetsRouter from './routes/skill-sets.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'good' }));
app.use('/api/projects', projectsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api/agent', agentRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/pipelines', pipelinesRouter);
app.use('/api/prompt-sets', promptSetsRouter);
app.use('/api/skill-sets', skillSetsRouter);

app.use((err, req, res, _next) => {
  console.error('[good]', err);
  res.status(err.status || 500).json({ error: err.message || 'Server Error' });
});

app.listen(PORT, () => {
  console.log(`[good] running at http://localhost:${PORT}`);
  console.log(`[good] projects root: ${PROJECTS_ROOT}`);
});
