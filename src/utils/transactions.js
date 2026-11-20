/** Converts a transaction document into the shape the API returns. */
export function toTransaction(transaction) {
  const { _id, vendorId, ...rest } = transaction;

  return {
    id: _id.toString(),
    vendorId: String(vendorId),
    ...rest,
  };
}
