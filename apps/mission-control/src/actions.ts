import { Router, json } from 'express';
import type { Config } from './config.js';
import type { StateStore } from './state.js';

// Demo-Steuerung: stößt die Szenarien der Präsentation direkt aus der App an
// (workflow_dispatch) und erteilt wartende Umgebungs-Freigaben. Nur mit Token
// nutzbar; ohne Token antworten die Endpunkte mit 503 und das Frontend blendet
// die Steuerung aus.

type Scenario = 'normal' | 'break' | 'flaky' | 'stability' | 'rollback';

interface TriggerBody {
  scenario?: Scenario;
  env?: 'int' | 'abnahme' | 'prod';
  restoreDb?: boolean;
}

const GITHUB_API = 'https://api.github.com';

export function actionsRouter(config: Config, state: StateStore): Router {
  const router = Router();
  router.use(json());

  async function github(path: string, body: unknown): Promise<Response> {
    return fetch(`${GITHUB_API}/repos/${config.githubRepository}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  }

  router.post('/trigger', async (req, res) => {
    if (!config.githubToken) {
      res.status(503).json({ error: 'Kein GitHub-Token konfiguriert — Demo-Steuerung inaktiv.' });
      return;
    }
    const { scenario, env, restoreDb } = (req.body ?? {}) as TriggerBody;

    const snapshot = state.getSnapshot();
    const run = snapshot.github.run;
    const pipelineBusy =
      run?.workflow === 'pipeline' &&
      (run.status === 'queued' || run.status === 'in_progress' || run.status === 'waiting');

    let workflowFile: string;
    let inputs: Record<string, string> = {};
    let label: string;

    switch (scenario) {
      case 'normal':
        workflowFile = 'pipeline.yml';
        label = 'Normaler Pipeline-Lauf';
        break;
      case 'break':
        workflowFile = 'pipeline.yml';
        inputs = { demo_break_deploy: 'true' };
        label = 'Kaputtes Deployment (Rollback-Demo)';
        break;
      case 'flaky':
        workflowFile = 'pipeline.yml';
        inputs = { demo_flaky: 'true' };
        label = 'Flaky-Test-Demo';
        break;
      case 'stability':
        workflowFile = 'stability-check.yml';
        label = 'Stabilitäts-Check';
        break;
      case 'rollback':
        if (env !== 'int' && env !== 'abnahme' && env !== 'prod') {
          res.status(400).json({ error: 'rollback braucht env: int | abnahme | prod.' });
          return;
        }
        workflowFile = 'rollback-manual.yml';
        inputs = { environment: env, restore_db: restoreDb ? 'true' : 'false' };
        label = `Manueller Rollback ${env}`;
        break;
      default:
        res.status(400).json({ error: `Unbekanntes Szenario: ${String(scenario)}` });
        return;
    }

    if (workflowFile === 'pipeline.yml' && pipelineBusy) {
      res.status(409).json({
        error: 'Es läuft bereits ein Pipeline-Lauf — erst abschließen/freigeben oder abwarten.',
      });
      return;
    }

    try {
      const response = await github(`/actions/workflows/${workflowFile}/dispatches`, {
        ref: 'main',
        ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
      });
      if (response.status === 204) {
        res.status(202).json({ message: `${label} gestartet.` });
      } else {
        const detail = await response.text();
        res.status(502).json({ error: `GitHub lehnte ab (HTTP ${response.status}): ${detail.slice(0, 200)}` });
      }
    } catch (error) {
      res.status(502).json({ error: `GitHub nicht erreichbar: ${(error as Error).message}` });
    }
  });

  router.post('/approve', async (req, res) => {
    if (!config.githubToken) {
      res.status(503).json({ error: 'Kein GitHub-Token konfiguriert — Freigabe inaktiv.' });
      return;
    }
    const { env } = (req.body ?? {}) as { env?: string };
    const snapshot = state.getSnapshot();
    const run = snapshot.github.run;
    if (!run || !snapshot.github.pendingApprovals.includes(env as 'abnahme' | 'prod')) {
      res.status(409).json({ error: `Keine wartende Freigabe für "${String(env)}".` });
      return;
    }
    try {
      // Environment-IDs der wartenden Deployments auflösen, dann gezielt freigeben.
      const pendingResponse = await fetch(
        `${GITHUB_API}/repos/${config.githubRepository}/actions/runs/${run.id}/pending_deployments`,
        {
          headers: {
            Authorization: `Bearer ${config.githubToken}`,
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      const pending = (await pendingResponse.json()) as Array<{
        environment: { id: number; name: string };
      }>;
      const match = pending.find((entry) => entry.environment.name === env);
      if (!match) {
        res.status(409).json({ error: `GitHub meldet keine wartende Freigabe für "${String(env)}".` });
        return;
      }
      const response = await github(`/actions/runs/${run.id}/pending_deployments`, {
        environment_ids: [match.environment.id],
        state: 'approved',
        comment: 'Freigabe aus Mission Control',
      });
      if (response.ok) {
        res.status(202).json({ message: `Freigabe für ${String(env)} erteilt.` });
      } else {
        const detail = await response.text();
        res.status(502).json({ error: `GitHub lehnte ab (HTTP ${response.status}): ${detail.slice(0, 200)}` });
      }
    } catch (error) {
      res.status(502).json({ error: `GitHub nicht erreichbar: ${(error as Error).message}` });
    }
  });

  return router;
}
