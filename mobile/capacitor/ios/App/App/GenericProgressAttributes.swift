#if canImport(ActivityKit)
import Foundation
import ActivityKit

@available(iOS 16.1, *)
// Generic attributes for a simple progress-based live activity
public struct GenericProgressAttributes: ActivityAttributes {
    public typealias ContentState = State

    public struct State: Codable, Hashable {
        public var subtitle: String?
        public var progress: Double // 0.0 ... 1.0

        public init(subtitle: String? = nil, progress: Double) {
            self.subtitle = subtitle
            self.progress = progress
        }
    }

    public var title: String

    public init(title: String) {
        self.title = title
    }
}
#endif
