import Foundation

enum AssetCategory: String, Codable, CaseIterable {
    case crypto
    case stock
    case fiat

    var displayName: String {
        switch self {
        case .crypto: return "Crypto"
        case .stock: return "Stocks & ETFs"
        case .fiat: return "Cash"
        }
    }

    var iconName: String {
        switch self {
        case .crypto: return "bitcoinsign.circle.fill"
        case .stock: return "chart.line.uptrend.xyaxis"
        case .fiat: return "banknote.fill"
        }
    }
}
