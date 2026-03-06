import Foundation
import SwiftData

enum TransactionType: String, Codable {
    case delta    // Add or subtract from current amount
}

@Model
final class Transaction {
    var id: UUID
    var date: Date
    var typeRaw: String  // raw value of TransactionType
    var amount: Double
    var note: String?
    var createdAt: Date

    var asset: Asset?

    var type: TransactionType {
        get { TransactionType(rawValue: typeRaw) ?? .delta }
        set { typeRaw = newValue.rawValue }
    }

    init(date: Date, type: TransactionType, amount: Double, note: String? = nil) {
        self.id = UUID()
        self.date = date
        self.typeRaw = type.rawValue
        self.amount = amount
        self.note = note
        self.createdAt = Date()
    }
}
