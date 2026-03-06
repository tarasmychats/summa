import Foundation

enum AssetCategory: String, Codable, CaseIterable {
    case crypto
    case stock
    case etf
    case fiat

    var displayName: String {
        switch self {
        case .crypto: return "Crypto"
        case .stock: return "Stocks"
        case .etf: return "ETFs"
        case .fiat: return "Cash"
        }
    }

    var iconName: String {
        switch self {
        case .crypto: return "bitcoinsign.circle.fill"
        case .stock: return "chart.line.uptrend.xyaxis"
        case .etf: return "chart.pie.fill"
        case .fiat: return "banknote.fill"
        }
    }
}
