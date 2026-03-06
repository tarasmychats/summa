# Initial Transaction on Asset Add

## Problem

When adding an asset, no transaction is created. The transaction list appears empty until the user manually adds one. Adding the first delta transaction then triggers automatic baseline creation, causing two transactions to appear at once — confusing.

## Design

In `AddAssetView.saveAsset()`, after creating the `Asset`, also create a `snapshot` `Transaction`:

- **Type:** `snapshot` (semantically correct — "I own X right now")
- **Amount:** the entered amount
- **Date:** now (`Date()`)
- **Note:** nil (blank)
- **Relationship:** `txn.asset = asset`

Insert the transaction into the model context alongside the asset.

## Impact

- Transaction list shows the initial balance immediately after adding an asset
- The baseline-creation logic in `AddTransactionView.save()` (lines 99-109) won't trigger for subsequent delta transactions, since `existingTxns` will no longer be empty
- `currentAmount` uses transaction replay instead of `amount` fallback — same value, proper history
