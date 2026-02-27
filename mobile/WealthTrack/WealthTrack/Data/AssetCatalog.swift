import Foundation

struct AssetDefinition: Identifiable, Hashable {
    let id: String       // e.g., "bitcoin", "VOO", "USD"
    let name: String     // e.g., "Bitcoin", "Vanguard S&P 500 ETF"
    let symbol: String   // display symbol, e.g., "BTC", "VOO", "USD"
    let category: AssetCategory
}

enum AssetCatalog {
    static let crypto: [AssetDefinition] = [
        AssetDefinition(id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: .crypto),
        AssetDefinition(id: "ethereum", name: "Ethereum", symbol: "ETH", category: .crypto),
        AssetDefinition(id: "solana", name: "Solana", symbol: "SOL", category: .crypto),
        AssetDefinition(id: "binancecoin", name: "BNB", symbol: "BNB", category: .crypto),
        AssetDefinition(id: "ripple", name: "XRP", symbol: "XRP", category: .crypto),
        AssetDefinition(id: "cardano", name: "Cardano", symbol: "ADA", category: .crypto),
    ]

    static let stocks: [AssetDefinition] = [
        AssetDefinition(id: "VOO", name: "Vanguard S&P 500 ETF", symbol: "VOO", category: .stock),
        AssetDefinition(id: "SPY", name: "SPDR S&P 500 ETF", symbol: "SPY", category: .stock),
        AssetDefinition(id: "QQQ", name: "Invesco Nasdaq 100 ETF", symbol: "QQQ", category: .stock),
        AssetDefinition(id: "AAPL", name: "Apple", symbol: "AAPL", category: .stock),
        AssetDefinition(id: "MSFT", name: "Microsoft", symbol: "MSFT", category: .stock),
        AssetDefinition(id: "GOOGL", name: "Alphabet (Google)", symbol: "GOOGL", category: .stock),
    ]

    static let fiat: [AssetDefinition] = [
        AssetDefinition(id: "USD", name: "US Dollar", symbol: "USD", category: .fiat),
        AssetDefinition(id: "EUR", name: "Euro", symbol: "EUR", category: .fiat),
        AssetDefinition(id: "UAH", name: "Ukrainian Hryvnia", symbol: "UAH", category: .fiat),
        AssetDefinition(id: "GBP", name: "British Pound", symbol: "GBP", category: .fiat),
    ]

    static var all: [AssetDefinition] {
        crypto + stocks + fiat
    }

    static func search(query: String) -> [AssetDefinition] {
        let q = query.lowercased()
        return all.filter {
            $0.name.lowercased().contains(q) || $0.symbol.lowercased().contains(q)
        }
    }
}
