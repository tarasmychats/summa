import Foundation

struct AssetDefinition: Identifiable, Hashable {
    let id: String
    let name: String
    let symbol: String
    let category: AssetCategory

    init(id: String, name: String, symbol: String, category: AssetCategory) {
        self.id = id
        self.name = name
        self.symbol = symbol
        self.category = category
    }

    init(from searchResult: SearchResultItem) {
        self.id = searchResult.id
        self.name = searchResult.name
        self.symbol = searchResult.symbol
        self.category = AssetCategory(rawValue: searchResult.category) ?? .fiat
    }
}
