import Foundation

/// Helpers for interactive chart selection — finding the nearest data point to a given date.
/// Extracted as pure functions so they are testable without SwiftUI or Charts dependencies.
enum ChartSelectionHelper {

    /// Finds the index of the nearest element by date using binary search.
    /// - Parameters:
    ///   - items: Sorted array of items.
    ///   - targetDate: The date the user dragged to.
    ///   - dateOf: Closure to extract the date from an element.
    /// - Returns: The index of the nearest element, or `nil` if `items` is empty.
    static func nearestIndex<C: RandomAccessCollection>(
        in items: C,
        to targetDate: Date,
        dateOf: (C.Element) -> Date
    ) -> C.Index? where C.Index == Int {
        guard !items.isEmpty else { return nil }

        let target = targetDate.timeIntervalSince1970

        var low = items.startIndex
        var high = items.endIndex - 1

        while low < high {
            let mid = (low + high) / 2
            if dateOf(items[mid]).timeIntervalSince1970 < target {
                low = mid + 1
            } else {
                high = mid
            }
        }

        if low == items.startIndex {
            return items.startIndex
        }

        let distPrev = abs(dateOf(items[low - 1]).timeIntervalSince1970 - target)
        let distCurr = abs(dateOf(items[low]).timeIntervalSince1970 - target)
        return distPrev <= distCurr ? low - 1 : low
    }

    /// Convenience overload for arrays of Date.
    static func nearestIndex(in dates: [Date], to targetDate: Date) -> Int? {
        nearestIndex(in: dates, to: targetDate, dateOf: { $0 })
    }
}
