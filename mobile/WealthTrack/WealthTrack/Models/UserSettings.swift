import Foundation
import SwiftData

@Model
final class UserSettings {
    var id: UUID
    var displayCurrency: String  // e.g., "USD", "EUR", "UAH"
    var isPremium: Bool

    init(displayCurrency: String = "USD") {
        self.id = UUID()
        self.displayCurrency = displayCurrency
        self.isPremium = false
    }
}
