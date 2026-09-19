// The database, through the RDS Data API. The Lambda functions never open a network connection to
// the cluster and never see its password: they call an AWS API with their IAM role, and the API
// reads the credential from Secrets Manager itself. That is also why the database can stay with
// no route to the internet at all.
//
// The SDK is loaded on first use, not at import, so the unit tests can exercise everything that
// sits above this module without it installed. The Lambda Node.js runtime ships it.

export function createDb({ CLUSTER_ARN, SECRET_ARN, DATABASE_NAME } = {}) {
  let sdk;
  let client;

  async function ready() {
    if (!client) {
      sdk = await import("@aws-sdk/client-rds-data");
      client = new sdk.RDSDataClient({});
    }
  }

  const target = { resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN };

  return {
    // Rows as plain objects keyed by column name.
    async query(sql, params = {}, transactionId) {
      await ready();
      const result = await client.send(new sdk.ExecuteStatementCommand({
        ...target, database: DATABASE_NAME, sql, parameters: toParameters(params), formatRecordsAs: "JSON", transactionId
      }));
      return result.formattedRecords ? JSON.parse(result.formattedRecords) : [];
    },

    // For statements that return nothing worth reading: DDL, inserts, updates.
    async execute(sql, params = {}, transactionId) {
      await ready();
      const result = await client.send(new sdk.ExecuteStatementCommand({
        ...target, database: DATABASE_NAME, sql, parameters: toParameters(params), transactionId
      }));
      return { updated: result.numberOfRecordsUpdated ?? 0 };
    },

    // All of work() or none of it.
    async transaction(work) {
      await ready();
      const { transactionId } = await client.send(new sdk.BeginTransactionCommand({ ...target, database: DATABASE_NAME }));
      try {
        const result = await work(transactionId);
        await client.send(new sdk.CommitTransactionCommand({ ...target, transactionId }));
        return result;
      } catch (error) {
        await client.send(new sdk.RollbackTransactionCommand({ ...target, transactionId })).catch(() => {});
        throw error;
      }
    }
  };
}

export function toParameters(params) {
  return Object.entries(params).map(([name, value]) => ({ name, value: toField(value) }));
}

function toField(value) {
  if (value === null || value === undefined) return { isNull: true };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
  return { stringValue: String(value) };
}

// Aurora Serverless in Dev pauses after an hour idle, and the first call while it wakes fails with
// this. It is worth telling the caller to retry rather than reporting a server fault.
export function isDatabaseWaking(error) {
  return Boolean(error) && (error.name === "DatabaseResumingException" || /resuming after being auto-paused/i.test(error.message || ""));
}
