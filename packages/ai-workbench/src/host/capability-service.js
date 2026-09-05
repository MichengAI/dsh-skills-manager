const CAPABILITY_ID = /^(skill:[a-z0-9._-]+:[a-z0-9._-]+|tool:[a-z0-9._-]+|business:[a-z0-9._-]+)$/i;
const MAX_CAPABILITIES = 200;
const MAX_ID_LENGTH = 200;

function invalidCapabilities() {
  return Object.assign(new Error("invalid capabilities"), {
    code: "invalid-capabilities",
    statusCode: 400,
    public: true,
  });
}

function normalizeIds(ids) {
  if (
    !Array.isArray(ids)
    || ids.length > MAX_CAPABILITIES
    || ids.some((id) => typeof id !== "string" || id.length > MAX_ID_LENGTH || !CAPABILITY_ID.test(id))
  ) throw invalidCapabilities();
  return [...new Set(ids)];
}

export function createCapabilityService({ repository }) {
  let writes = Promise.resolve();

  return {
    get() {
      return repository.getCapabilityPreferences();
    },

    async replace(ids) {
      const enabledIds = normalizeIds(ids);
      const operation = () => repository.putCapabilityPreferences({
        enabledIds,
        updatedAt: new Date().toISOString(),
      });
      const next = writes.then(operation, operation);
      writes = next.catch(() => undefined);
      return next;
    },
  };
}
