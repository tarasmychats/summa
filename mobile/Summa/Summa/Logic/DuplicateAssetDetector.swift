import Foundation

enum DuplicateAssetDetector {
    /// Returns the set of AssetDefinition IDs that already exist in the user's portfolio.
    /// Matching is by API ID: Asset.symbol == AssetDefinition.id
    static func existingAssetIDs(from assets: [Asset]) -> Set<String> {
        Set(assets.map(\.symbol))
    }

    /// Checks if a search result asset is already in the user's portfolio.
    static func isAlreadyAdded(_ definition: AssetDefinition, existingIDs: Set<String>) -> Bool {
        existingIDs.contains(definition.id)
    }
}
