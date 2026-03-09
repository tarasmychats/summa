import Foundation

enum TransactionMarkerBuilder {

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    static func buildMarkers(
        dataPoints: [PortfolioDataPoint],
        transactionsByAsset: [String: [Transaction]]
    ) -> [TransactionMarker] {
        var valueLookup: [String: (date: Date, value: Double)] = [:]
        for point in dataPoints {
            let key = dateFormatter.string(from: point.date)
            valueLookup[key] = (point.date, point.value)
        }

        var groupedByDay: [String: [Transaction]] = [:]
        for (_, transactions) in transactionsByAsset {
            for txn in transactions {
                let key = dateFormatter.string(from: txn.parsedDate)
                groupedByDay[key, default: []].append(txn)
            }
        }

        var markers: [TransactionMarker] = []
        for (dateString, transactions) in groupedByDay {
            guard let match = valueLookup[dateString] else { continue }
            markers.append(TransactionMarker(
                id: dateString,
                date: match.date,
                value: match.value,
                transactions: transactions
            ))
        }

        return markers.sorted { $0.date < $1.date }
    }
}
