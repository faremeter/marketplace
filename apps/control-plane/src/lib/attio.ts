import { logger } from "../logger.js";

const ATTIO_PEOPLE_URL =
  "https://api.attio.com/v2/objects/people/records?matching_attribute=email_addresses";

const LIST_VERIFY_TTL_MS = 60 * 60 * 1000;
let listVerifiedAt = 0;
const MAX_SYNCED_CACHE = 10_000;
const syncedEmails = new Set<string>();

async function verifyList(apiKey: string, listId: string): Promise<boolean> {
  if (Date.now() - listVerifiedAt < LIST_VERIFY_TTL_MS) return true;
  try {
    const res = await fetch(`https://api.attio.com/v2/lists/${listId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      logger.error(`Attio list ${listId} not found: ${res.status}`);
      return false;
    }
    listVerifiedAt = Date.now();
    return true;
  } catch (error) {
    logger.error(
      `Attio list verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

export async function syncContactToAttio(email: string): Promise<void> {
  if (process.env.NODE_ENV === "test") return;

  const apiKey = process.env.ATTIO_API_KEY;
  const listId = process.env.ATTIO_LIST_ID;
  if (!apiKey || !listId) {
    logger.warn("ATTIO_API_KEY or ATTIO_LIST_ID not set, skipping CRM sync");
    return;
  }

  if (syncedEmails.has(email)) return;
  if (syncedEmails.size >= MAX_SYNCED_CACHE) syncedEmails.clear();
  if (!(await verifyList(apiKey, listId))) return;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const personRes = await fetch(ATTIO_PEOPLE_URL, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        data: {
          values: {
            email_addresses: [{ email_address: email }],
          },
        },
      }),
    });

    if (!personRes.ok) {
      const body = await personRes.text();
      logger.error(
        `Attio CRM sync failed for ${email}: ${personRes.status} ${body}`,
      );
      return;
    }

    const person = (await personRes.json()) as {
      data?: { id?: { record_id?: string } };
    };
    const recordId = person.data?.id?.record_id;
    if (!recordId) {
      logger.error(`Attio CRM sync: unexpected response shape for ${email}`);
      return;
    }

    const entriesRes = await fetch(
      `https://api.attio.com/v2/objects/people/records/${recordId}/entries`,
      { headers },
    );

    if (!entriesRes.ok) {
      logger.error(
        `Attio entries check failed for ${email}: ${entriesRes.status}`,
      );
      return;
    }

    const entries = (await entriesRes.json()) as {
      data: { list_id: string }[];
    };
    if (entries.data.some((e) => e.list_id === listId)) {
      syncedEmails.add(email);
      logger.info(`Attio CRM sync: ${email} already in list, skipping`);
      return;
    }

    const listRes = await fetch(
      `https://api.attio.com/v2/lists/${listId}/entries`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            parent_record_id: recordId,
            parent_object: "people",
            entry_values: {
              api_sign_up: [{ value: new Date().toISOString() }],
            },
          },
        }),
      },
    );

    if (!listRes.ok) {
      const body = await listRes.text();
      logger.error(
        `Attio list entry failed for ${email}: ${listRes.status} ${body}`,
      );
      return;
    }

    syncedEmails.add(email);
    logger.info(`Attio CRM sync: added ${email} to 1CD Registrations`);
  } catch (error) {
    logger.error(
      `Attio CRM sync error for ${email}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
