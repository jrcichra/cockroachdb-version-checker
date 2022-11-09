/**
 * Welcome to Cloudflare Workers! This is your first scheduled worker.
 *
 * - Run `wrangler dev --local` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/cdn-cgi/mf/scheduled"` to trigger the scheduled event
 * - Go back to the console to see what your worker has logged
 * - Update the Cron trigger in wrangler.toml (see https://developers.cloudflare.com/workers/wrangler/configuration/#triggers)
 * - Run `wrangler publish --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/runtime-apis/scheduled-event/
 */

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  STATE: KVNamespace;
  WEBHOOK_URL: string;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
}

interface Version {
  details: VersionDetail[];
}

interface VersionDetail {
  version: string;
  details: string;
}

const key = "last-version";
const nullVersion = "v22.1.9";

async function sendToDiscord(
  webhook: string,
  message: string
): Promise<Response> {
  if (!webhook) {
    console.log("I would send");
    console.log(message);
    throw Error("Webhook was not defined!!!");
  }
  return await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: message,
    }),
  });
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    // get the state from KV
    const oldState: VersionDetail | null = await env.STATE.get(key, {
      type: "json",
    });
    // make a uuid
    const uuid = crypto.randomUUID();
    // curl the cockroachdb api for a new release
    // this URL is used in the Cockroach UI
    console.log("Asking with version", oldState?.version ?? nullVersion);
    const f = await fetch(
      `https://register.cockroachdb.com/api/clusters/updates?uuid=${uuid}&version=${
        oldState?.version ?? nullVersion
      }`,
      {
        headers: {
          "User-Agent": "cockroachdb-version-checker",
        },
      }
    );
    const newState: Version = await f.json();
    console.log(newState);
    if (newState.details.length > 0) {
      const newState0 = newState.details[0];
      await env.STATE.put(key, JSON.stringify(newState0));
      sendToDiscord(
        env.WEBHOOK_URL,
        `There's a new version of CockroachDB: ${newState0.version} - ${newState0.details}`
      );
    } else {
      console.log(`No new version to squawk about!`);
    }
  },
};
