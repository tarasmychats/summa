import Foundation

enum PremiumGate {
    static let freeAssetLimit = 5

    static func canAddAsset(currentCount: Int, isPremium: Bool) -> Bool {
        isPremium || currentCount < freeAssetLimit
    }
}
