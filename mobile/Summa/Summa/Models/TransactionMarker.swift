import Foundation

struct TransactionMarker: Identifiable {
    let id: String           // date string "yyyy-MM-dd" for identity
    let date: Date
    let value: Double        // portfolio value at that date (Y position)
    let transactions: [Transaction]

    var isPositive: Bool {
        transactions.reduce(0) { $0 + $1.amount } >= 0
    }

    var isGrouped: Bool {
        transactions.count > 1
    }

    /// Summary text for overlay display, e.g. "+0.1 BTC, −500 USD"
    func summaryLines(assets: [Asset]) -> [String] {
        transactions.map { txn in
            let sign = txn.amount >= 0 ? "+" : ""
            let ticker = assets.first(where: { $0.id == txn.assetId })?.displayTicker ?? ""
            let formatted = txn.amount.formatted(.number.precision(.fractionLength(0...8)))
            return "\(sign)\(formatted) \(ticker)"
        }
    }
}
