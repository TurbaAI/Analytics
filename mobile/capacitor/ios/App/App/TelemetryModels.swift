import Combine
import Foundation
import UIKit
import UserNotifications

enum DashboardPage: String, CaseIterable, Identifiable {
    case cockpit = "Cockpit"
    case hosts = "Hosts"
    case trends = "Trends"
    case signals = "Signals"
    case notifications = "Alerts"
    case report = "Report"
    case ops = "Ops"

    var id: String { rawValue }
}

enum FeedTone {
    case live
    case local
    case warning
    case loading
}

enum HostStatusFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case action = "Action"
    case watch = "Watch"
    case healthy = "Healthy"

    var id: String { rawValue }

    func includes(_ host: HostSnapshot) -> Bool {
        switch self {
        case .all:
            return true
        case .action:
            return host.riskTone == .poor
        case .watch:
            return host.riskTone == .watch
        case .healthy:
            return host.riskTone == .good
        }
    }
}

struct TelemetryHistoryPoint: Identifiable {
    let id = UUID()
    let capturedAt: Date
    let label: String
    let averageGpuPct: Double
    let averageCpuPct: Double
    let averageMemoryPct: Double
    let averageDiskPct: Double
    let averageHealthScore: Double
    let totalNetworkMBps: Double

    init(snapshot: AnalyticsSnapshot, capturedAt: Date = Date()) {
        self.capturedAt = capturedAt
        self.label = Self.labelFormatter.string(from: capturedAt)
        self.averageGpuPct = snapshot.summary.averageGpuPct
        self.averageCpuPct = snapshot.summary.averageCpuPct
        self.averageMemoryPct = snapshot.summary.averageMemoryPct
        self.averageDiskPct = snapshot.summary.averageDiskPct
        self.averageHealthScore = snapshot.summary.averageHealthScore
        self.totalNetworkMBps = snapshot.summary.totalNetworkMBps
    }

    private static let labelFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}

struct HostSnapshot: Identifiable {
    let id: String
    let name: String
    let role: String
    let status: String
    let cpuPct: Double
    let gpuPct: Double
    let memoryPct: Double
    let diskPct: Double
    let networkMBps: Double
    let networkUtilizationPct: Double
    let queueMinutes: Double
    let efficiencyPct: Double
    let hardwareHealthScore: Double
    let hardwareFaultCount: Int
    let hardwareFaultLevel: String
    let hardwareRepairAction: String
    let clockSynchronized: Bool
    let uptimeSeconds: Double
    let gpuMemoryPct: Double
    let gpuPowerWatts: Double
    let gpuTemperatureC: Double
    let gpuProcessSummary: String
    let gpuThermalSummary: String
    let gpuTopologySummary: String
    let ollamaStatus: String
    let ollamaTokensPerSecond: Double
    let ollamaTimeToFirstTokenMs: Double
    let ncclRuntimeStatus: String
    let ncclRuntimeDetail: String
    let networkInterface: String
    let networkLocalAddress: String
    let networkLinkSpeedMbps: Double
    let observedServices: [String]
    let warnings: [String]
    let detail: String
}

struct OperatorSignal: Identifiable {
    let id: String
    let title: String
    let detail: String
    let tone: SignalTone
}

struct DeviceUserProfile {
    let displayName: String
    let detail: String
    let initials: String
    let imageData: Data?

    static func fallback(displayName: String? = nil, imageData: Data? = nil) -> DeviceUserProfile {
        let deviceName = UIDevice.current.name
        let inferredName = ownerName(from: deviceName)
        let resolvedName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = resolvedName?.isEmpty == false ? resolvedName! : inferredName
        return profile(displayName: name, detail: deviceDetail(from: deviceName), imageData: imageData)
    }

    static func profile(displayName: String, detail: String, imageData: Data?) -> DeviceUserProfile {
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedName = trimmedName.isEmpty ? ownerName(from: UIDevice.current.name) : trimmedName
        return DeviceUserProfile(
            displayName: resolvedName,
            detail: detail,
            initials: Self.initials(from: resolvedName),
            imageData: imageData
        )
    }

    private static func initials(from name: String) -> String {
        let words = name
            .replacingOccurrences(of: "'s iPhone", with: "")
            .replacingOccurrences(of: "’s iPhone", with: "")
            .split { !$0.isLetter && !$0.isNumber }
            .map(String.init)
        let letters = words.prefix(2).compactMap(\.first).map { String($0).uppercased() }
        return letters.isEmpty ? "TU" : letters.joined()
    }

    private static func ownerName(from deviceName: String) -> String {
        let cleaned = deviceName
            .replacingOccurrences(of: "'s iPhone", with: "")
            .replacingOccurrences(of: "’s iPhone", with: "")
            .replacingOccurrences(of: "'s iPad", with: "")
            .replacingOccurrences(of: "’s iPad", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.isEmpty || ["iphone", "ipad", "ahmad iphone"].contains(cleaned.lowercased()) {
            return "Set your name"
        }
        return cleaned
    }

    private static func deviceDetail(from deviceName: String) -> String {
        let normalized = deviceName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if ["iphone", "ipad"].contains(normalized) {
            return "This device"
        }
        return deviceName
    }
}

struct NotificationThresholdSettings: Codable, Equatable {
    var enabled = false
    var cpuPct = 85.0
    var gpuPct = 95.0
    var memoryPct = 88.0
    var diskPct = 85.0
    var healthScore = 70.0
    var queueMinutes = 5.0
    var networkMBps = 250.0
    var minimumAlertIntervalMinutes = 10.0
}

struct ThresholdBreach: Identifiable {
    let id: String
    let title: String
    let detail: String
    let tone: SignalTone
}

enum SignalTone {
    case good
    case watch
    case poor
}

struct AnalyticsSnapshot {
    let generatedAt: String
    let generatedAtDate: Date?
    let sourceLabel: String
    let observedHost: String
    let hosts: [HostSnapshot]
    let signals: [OperatorSignal]
    let importedSources: [String]
    let summary: Summary

    struct Summary {
        let hostCount: Int
        let gpuCount: Int
        let averageGpuPct: Double
        let averageCpuPct: Double
        let averageMemoryPct: Double
        let averageDiskPct: Double
        let averageEfficiencyPct: Double
        let averageHealthScore: Double
        let totalNetworkMBps: Double
        let maxQueueMinutes: Double
        let actionCount: Int
        let watchCount: Int
    }

    static let demo = AnalyticsSnapshot(
        generatedAt: "Sample bundle",
        generatedAtDate: nil,
        sourceLabel: "Local sample",
        observedHost: "local-controller",
        hosts: [
            HostSnapshot(
                id: "nuc14e",
                name: "NUC14E controller",
                role: "Product edge",
                status: "Sample observation",
                cpuPct: 34,
                gpuPct: 0,
                memoryPct: 61,
                diskPct: 42,
                networkMBps: 18,
                networkUtilizationPct: 9,
                queueMinutes: 0,
                efficiencyPct: 72,
                hardwareHealthScore: 91,
                hardwareFaultCount: 0,
                hardwareFaultLevel: "clear",
                hardwareRepairAction: "observe",
                clockSynchronized: true,
                uptimeSeconds: 172_800,
                gpuMemoryPct: 0,
                gpuPowerWatts: 0,
                gpuTemperatureC: 0,
                gpuProcessSummary: "No active GPU process attribution in the sample.",
                gpuThermalSummary: "Thermal state clear.",
                gpuTopologySummary: "Single controller host.",
                ollamaStatus: "reachable",
                ollamaTokensPerSecond: 34,
                ollamaTimeToFirstTokenMs: 420,
                ncclRuntimeStatus: "not-present",
                ncclRuntimeDetail: "No NCCL runtime required on the controller sample.",
                networkInterface: "en0",
                networkLocalAddress: "192.168.10.30",
                networkLinkSpeedMbps: 2500,
                observedServices: ["collector", "api", "grafana", "prometheus"],
                warnings: [],
                detail: "Collector, API, Grafana, and Prometheus are represented by the local sample."
            ),
            HostSnapshot(
                id: "spark1",
                name: "SPARK1",
                role: "GPU worker",
                status: "Watch",
                cpuPct: 58,
                gpuPct: 71,
                memoryPct: 76,
                diskPct: 51,
                networkMBps: 92,
                networkUtilizationPct: 22,
                queueMinutes: 3,
                efficiencyPct: 64,
                hardwareHealthScore: 82,
                hardwareFaultCount: 0,
                hardwareFaultLevel: "watch",
                hardwareRepairAction: "observe",
                clockSynchronized: true,
                uptimeSeconds: 86_400,
                gpuMemoryPct: 68,
                gpuPowerWatts: 226,
                gpuTemperatureC: 63,
                gpuProcessSummary: "Two GPU processes share active memory.",
                gpuThermalSummary: "Benchmark comparable, no throttle active.",
                gpuTopologySummary: "CX7 path available for the SPARK pair.",
                ollamaStatus: "reachable",
                ollamaTokensPerSecond: 21,
                ollamaTimeToFirstTokenMs: 780,
                ncclRuntimeStatus: "present",
                ncclRuntimeDetail: "NCCL runtime visible on the interconnect sample.",
                networkInterface: "enp1s0f1np1",
                networkLocalAddress: "192.168.100.10",
                networkLinkSpeedMbps: 400_000,
                observedServices: ["docker", "ollama", "node-exporter"],
                warnings: ["Recoverable queue delay"],
                detail: "Moderate GPU pressure with recoverable queue delay."
            ),
            HostSnapshot(
                id: "pi-fleet",
                name: "Pi fleet",
                role: "Edge agents",
                status: "Healthy",
                cpuPct: 22,
                gpuPct: 0,
                memoryPct: 44,
                diskPct: 37,
                networkMBps: 8,
                networkUtilizationPct: 4,
                queueMinutes: 0,
                efficiencyPct: 81,
                hardwareHealthScore: 78,
                hardwareFaultCount: 0,
                hardwareFaultLevel: "watch",
                hardwareRepairAction: "observe",
                clockSynchronized: false,
                uptimeSeconds: 57_600,
                gpuMemoryPct: 0,
                gpuPowerWatts: 0,
                gpuTemperatureC: 0,
                gpuProcessSummary: "No GPU path on edge agents.",
                gpuThermalSummary: "No accelerator thermal signal.",
                gpuTopologySummary: "Edge agent group.",
                ollamaStatus: "",
                ollamaTokensPerSecond: 0,
                ollamaTimeToFirstTokenMs: 0,
                ncclRuntimeStatus: "not-present",
                ncclRuntimeDetail: "",
                networkInterface: "eth0",
                networkLocalAddress: "pi-fleet",
                networkLinkSpeedMbps: 1000,
                observedServices: ["live-agent"],
                warnings: ["Clock source needs attention"],
                detail: "One clock source needs attention before evidence export."
            )
        ],
        signals: [
            OperatorSignal(
                id: "sample-clock",
                title: "Clock source check",
                detail: "One sample host is unsynchronized, so benchmark evidence should be marked provisional.",
                tone: .watch
            ),
            OperatorSignal(
                id: "sample-efficiency",
                title: "Efficiency opportunity",
                detail: "SPARK1 has enough GPU activity to warrant placement and input-pipeline review.",
                tone: .good
            )
        ],
        importedSources: ["local-machine", "prometheus", "grafana", "redfish"],
        summary: Summary(
            hostCount: 3,
            gpuCount: 1,
            averageGpuPct: 24,
            averageCpuPct: 38,
            averageMemoryPct: 60,
            averageDiskPct: 43,
            averageEfficiencyPct: 72,
            averageHealthScore: 84,
            totalNetworkMBps: 118,
            maxQueueMinutes: 3,
            actionCount: 0,
            watchCount: 2
        )
    )
}

@MainActor
final class AnalyticsViewModel: ObservableObject {
    @Published var page: DashboardPage = .cockpit
    @Published var snapshot: AnalyticsSnapshot = .demo
    @Published var history: [TelemetryHistoryPoint] = []
    @Published var userProfile: DeviceUserProfile = .fallback()
    @Published var feedTone: FeedTone = .local
    @Published var feedLabel = "Loaded locally"
    @Published var isRefreshing = false
    @Published var selectedHost: HostSnapshot?
    @Published var hostSearchText = ""
    @Published var hostFilter: HostStatusFilter = .all
    @Published var endpointText: String
    @Published var autoRefreshEnabled: Bool
    @Published var lastUpdated: Date?
    @Published var lastErrorMessage = ""
    @Published var notificationSettings: NotificationThresholdSettings
    @Published var notificationAuthorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published var lastNotificationSummary = "No threshold notifications sent yet."
    @Published var reportCopyState = ""
    @Published var pairingStatusMessage = ""

    static let defaultLiveBundleURLString = "http://192.168.10.103:8000/build/demo/live-machine-bundle.json"

    private static let endpointDefaultsKey = "turbalance.liveBundleEndpoint"
    private static let autoRefreshDefaultsKey = "turbalance.autoRefreshEnabled"
    private static let cachedBundleDefaultsKey = "turbalance.cachedLiveBundle"
    private static let notificationDefaultsKey = "turbalance.notificationThresholds"
    private static let profileNameDefaultsKey = "turbalance.profileDisplayName"
    private static let profileImageDefaultsKey = "turbalance.profileImageData"
    private var hasLoaded = false
    private var refreshLoopTask: Task<Void, Never>?
    private var lastNotificationTimes: [String: Date] = [:]

    init() {
        let defaults = UserDefaults.standard
        self.endpointText = defaults.string(forKey: Self.endpointDefaultsKey) ?? Self.defaultLiveBundleURLString
        if let settingsData = defaults.data(forKey: Self.notificationDefaultsKey),
           let settings = try? JSONDecoder().decode(NotificationThresholdSettings.self, from: settingsData) {
            self.notificationSettings = settings
        } else {
            self.notificationSettings = NotificationThresholdSettings()
        }
        if defaults.object(forKey: Self.autoRefreshDefaultsKey) == nil {
            self.autoRefreshEnabled = true
        } else {
            self.autoRefreshEnabled = defaults.bool(forKey: Self.autoRefreshDefaultsKey)
        }
        recordSnapshot(.demo)
    }

    deinit {
        refreshLoopTask?.cancel()
    }

    var cachedSnapshotAvailable: Bool {
        UserDefaults.standard.data(forKey: Self.cachedBundleDefaultsKey) != nil
    }

    var freshnessText: String {
        if isRefreshing { return "Refreshing now" }
        if let lastUpdated {
            return "Updated \(Self.relativeFormatter.localizedString(for: lastUpdated, relativeTo: Date()))"
        }
        return snapshot.freshnessLabel
    }

    func loadIfNeeded() {
        guard !hasLoaded else { return }
        hasLoaded = true
        configureAutoRefresh()
        loadUserProfile()
        refreshNotificationAuthorizationStatus()
        Task { await refresh(automatic: true) }
    }

    func refresh(automatic: Bool = false) async {
        isRefreshing = true
        if !automatic {
            feedTone = .loading
            feedLabel = "Refreshing"
        }
        defer { isRefreshing = false }

        do {
            guard let url = URL(string: endpointText.trimmingCharacters(in: .whitespacesAndNewlines)) else {
                throw URLError(.badURL)
            }

            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                throw URLError(.badServerResponse)
            }

            let nextSnapshot = try AnalyticsSnapshot(bundleData: data, sourceLabel: "Live telemetry")
            UserDefaults.standard.set(data, forKey: Self.cachedBundleDefaultsKey)
            snapshot = nextSnapshot
            feedTone = nextSnapshot.isStale ? .warning : .live
            feedLabel = nextSnapshot.isStale ? "Stale live feed" : "Live"
            lastUpdated = Date()
            lastErrorMessage = ""
            recordSnapshot(nextSnapshot)
            evaluateNotificationThresholds(for: nextSnapshot)
        } catch {
            lastErrorMessage = error.localizedDescription

            if let cached = cachedSnapshot() {
                snapshot = cached
                feedTone = automatic ? .local : .warning
                feedLabel = automatic ? "Cached" : "Live feed unavailable"
                if history.count <= 1 {
                    recordSnapshot(cached)
                }
                evaluateNotificationThresholds(for: cached)
            } else if automatic {
                snapshot = .demo
                feedTone = .local
                feedLabel = "Loaded locally"
            } else {
                feedTone = .warning
                feedLabel = "Live feed unavailable"
            }
        }
    }

    func saveEndpoint() {
        UserDefaults.standard.set(endpointText.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Self.endpointDefaultsKey)
        pairingStatusMessage = "Endpoint saved."
        Task { await refresh() }
    }

    func resetEndpoint() {
        endpointText = Self.defaultLiveBundleURLString
        saveEndpoint()
    }

    func applyPairingPayload(_ payload: String) {
        guard let url = Self.endpointURL(from: payload) else {
            pairingStatusMessage = "Pairing payload did not include a valid bundle URL."
            return
        }

        endpointText = url.absoluteString
        UserDefaults.standard.set(endpointText, forKey: Self.endpointDefaultsKey)
        pairingStatusMessage = "Connected to \(url.host ?? "live bundle")."
        Task { await refresh() }
    }

    func setAutoRefreshEnabled(_ enabled: Bool) {
        autoRefreshEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: Self.autoRefreshDefaultsKey)
        configureAutoRefresh()
    }

    func persistNotificationSettings() {
        if let data = try? JSONEncoder().encode(notificationSettings) {
            UserDefaults.standard.set(data, forKey: Self.notificationDefaultsKey)
        }
        evaluateNotificationThresholds(for: snapshot)
    }

    func setNotificationsEnabled(_ enabled: Bool) {
        notificationSettings.enabled = enabled
        persistNotificationSettings()
        guard enabled else {
            lastNotificationSummary = "Threshold notifications are paused."
            return
        }

        Task {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
                notificationAuthorizationStatus = await Self.currentNotificationAuthorizationStatus()
                lastNotificationSummary = granted
                    ? "Notifications are ready. Alerts will fire when thresholds are crossed."
                    : "Notification permission was not granted on this iPhone."
                evaluateNotificationThresholds(for: snapshot)
            } catch {
                notificationAuthorizationStatus = await Self.currentNotificationAuthorizationStatus()
                lastNotificationSummary = error.localizedDescription
            }
        }
    }

    func sendTestNotification() {
        Task {
            let status = await Self.currentNotificationAuthorizationStatus()
            notificationAuthorizationStatus = status
            guard notificationSettings.enabled, status.allowsAlerts else {
                lastNotificationSummary = "Enable notifications and allow permission before sending a test."
                return
            }
            scheduleLocalNotification(
                id: "threshold-test-\(Date().timeIntervalSince1970)",
                title: "turbalance alert test",
                body: "Threshold notifications are working on this iPhone."
            )
            lastNotificationSummary = "Test notification scheduled."
        }
    }

    var currentThresholdBreaches: [ThresholdBreach] {
        notificationSettings.breaches(in: snapshot)
    }

    var customerReportText: String {
        snapshot.customerReportText
    }

    func copyCustomerReport() {
        UIPasteboard.general.string = customerReportText
        reportCopyState = "Copied report"
    }

    func setUserProfileImage(_ imageData: Data) {
        UserDefaults.standard.set(imageData, forKey: Self.profileImageDefaultsKey)
        userProfile = DeviceUserProfile.profile(
            displayName: userProfile.displayName,
            detail: userProfile.detail,
            imageData: imageData
        )
    }

    func setUserDisplayName(_ displayName: String) {
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        UserDefaults.standard.set(trimmedName, forKey: Self.profileNameDefaultsKey)
        userProfile = DeviceUserProfile.profile(
            displayName: trimmedName,
            detail: userProfile.detail,
            imageData: userProfile.imageData
        )
    }

    private func configureAutoRefresh() {
        refreshLoopTask?.cancel()
        refreshLoopTask = nil
        guard autoRefreshEnabled else { return }

        refreshLoopTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard !Task.isCancelled else { return }
                await self?.refresh(automatic: true)
            }
        }
    }

    private func loadUserProfile() {
        Task {
            let displayName = UserDefaults.standard.string(forKey: Self.profileNameDefaultsKey)
            let imageData = UserDefaults.standard.data(forKey: Self.profileImageDefaultsKey)
            userProfile = await DeviceUserProfileProvider.loadProfile(displayName: displayName, imageData: imageData)
        }
    }

    private func refreshNotificationAuthorizationStatus() {
        Task {
            notificationAuthorizationStatus = await Self.currentNotificationAuthorizationStatus()
        }
    }

    private func evaluateNotificationThresholds(for snapshot: AnalyticsSnapshot) {
        guard notificationSettings.enabled, notificationAuthorizationStatus.allowsAlerts else { return }
        let breaches = notificationSettings.breaches(in: snapshot)
        guard !breaches.isEmpty else {
            lastNotificationSummary = "No configured thresholds are currently breached."
            return
        }

        let now = Date()
        let cooldown = notificationSettings.minimumAlertIntervalMinutes * 60
        var sentCount = 0
        for breach in breaches.prefix(3) {
            let lastSent = lastNotificationTimes[breach.id] ?? .distantPast
            guard now.timeIntervalSince(lastSent) >= cooldown else { continue }
            scheduleLocalNotification(id: breach.id, title: breach.title, body: breach.detail)
            lastNotificationTimes[breach.id] = now
            sentCount += 1
        }

        if sentCount > 0 {
            lastNotificationSummary = "Scheduled \(sentCount) threshold alert\(sentCount == 1 ? "" : "s")."
        } else {
            lastNotificationSummary = "Thresholds are breached, but alerts are cooling down."
        }
    }

    private func scheduleLocalNotification(id: String, title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "turbalance-\(id)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        )
        UNUserNotificationCenter.current().add(request)
    }

    private func cachedSnapshot() -> AnalyticsSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: Self.cachedBundleDefaultsKey) else {
            return nil
        }
        return try? AnalyticsSnapshot(bundleData: data, sourceLabel: "Cached telemetry")
    }

    private func recordSnapshot(_ snapshot: AnalyticsSnapshot) {
        history.append(TelemetryHistoryPoint(snapshot: snapshot))
        if history.count > 48 {
            history.removeFirst(history.count - 48)
        }
    }

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    private static func currentNotificationAuthorizationStatus() async -> UNAuthorizationStatus {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus)
            }
        }
    }

    private static func endpointURL(from payload: String) -> URL? {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        if let data = trimmed.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for key in ["bundleUrl", "url", "endpoint", "bundle"] {
                if let value = object[key] as? String, let url = validatedEndpointURL(value) {
                    return url
                }
            }
        }

        if let url = URL(string: trimmed),
           let scheme = url.scheme?.lowercased(),
           scheme == "turbalance",
           let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            for key in ["bundle", "bundleUrl", "url", "endpoint"] {
                if let value = components.queryItems?.first(where: { $0.name == key })?.value,
                   let endpoint = validatedEndpointURL(value) {
                    return endpoint
                }
            }
        }

        return validatedEndpointURL(trimmed)
    }

    private static func validatedEndpointURL(_ text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else {
            return nil
        }
        return ["http", "https"].contains(scheme) ? url : nil
    }
}

private extension AnalyticsSnapshot {
    init(bundleData: Data, sourceLabel: String) throws {
        let bundle = try JSONDecoder().decode(TelemetryBundle.self, from: bundleData)
        let runs = bundle.ingestion?.runs ?? []
        let hosts = runs.enumerated().map { index, run in
            HostSnapshot(run: run, index: index)
        }
        let signals = AnalyticsSnapshot.signals(from: hosts)
        let importedSources = Array(Set(
            runs.flatMap { $0.importedSources ?? [] } + (bundle.metadata?.sourceAdapters ?? [])
        )).sorted()
        let gpuCount = runs.reduce(0) { $0 + Int(($1.allocation?.gpus ?? 0).rounded()) }
        let generated = bundle.metadata?.generatedAt ?? "Unknown"
        let generatedDate = TelemetryDateParser.parse(generated)
        let actionCount = hosts.filter { $0.riskTone == .poor }.count
        let watchCount = hosts.filter { $0.riskTone == .watch }.count

        self.init(
            generatedAt: generated,
            generatedAtDate: generatedDate,
            sourceLabel: sourceLabel,
            observedHost: bundle.metadata?.observedHost ?? hosts.first?.name ?? bundle.metadata?.source ?? "Unknown",
            hosts: hosts,
            signals: signals,
            importedSources: importedSources,
            summary: Summary(
                hostCount: hosts.count,
                gpuCount: gpuCount,
                averageGpuPct: hosts.average(\.gpuPct),
                averageCpuPct: hosts.average(\.cpuPct),
                averageMemoryPct: hosts.average(\.memoryPct),
                averageDiskPct: hosts.average(\.diskPct),
                averageEfficiencyPct: hosts.average(\.efficiencyPct),
                averageHealthScore: hosts.average(\.hardwareHealthScore),
                totalNetworkMBps: hosts.reduce(0) { $0 + $1.networkMBps },
                maxQueueMinutes: hosts.map(\.queueMinutes).max() ?? 0,
                actionCount: actionCount,
                watchCount: watchCount
            )
        )
    }

    static func signals(from hosts: [HostSnapshot]) -> [OperatorSignal] {
        var signals: [OperatorSignal] = []

        hosts.filter { $0.riskTone == .poor }.forEach { host in
            signals.append(
                OperatorSignal(
                    id: "\(host.id)-action",
                    title: "Action needed",
                    detail: "\(host.name): \(host.primaryAction)",
                    tone: .poor
                )
            )
        }

        hosts.filter { !$0.clockSynchronized }.forEach { host in
            signals.append(
                OperatorSignal(
                    id: "\(host.id)-clock",
                    title: "Clock drift risk",
                    detail: "\(host.name) is not reporting a synchronized clock source.",
                    tone: .watch
                )
            )
        }

        hosts.filter { $0.memoryPct >= 90 }.forEach { host in
            signals.append(
                OperatorSignal(
                    id: "\(host.id)-memory",
                    title: "Memory pressure",
                    detail: "\(host.name) is at \(host.memoryPct.formattedPct) memory use.",
                    tone: .poor
                )
            )
        }

        hosts.filter { $0.diskPct >= 90 }.forEach { host in
            signals.append(
                OperatorSignal(
                    id: "\(host.id)-disk",
                    title: "Disk pressure",
                    detail: "\(host.name) is at \(host.diskPct.formattedPct) disk use.",
                    tone: .poor
                )
            )
        }

        hosts.filter { $0.gpuPct < 10 && $0.hasGpuEvidence }.forEach { host in
            signals.append(
                OperatorSignal(
                    id: "\(host.id)-gpu-idle",
                    title: "GPU idle window",
                    detail: "\(host.name) has low GPU activity and should be checked for scheduler or input stalls.",
                    tone: .watch
                )
            )
        }

        hosts.filter { $0.ollamaTimeToFirstTokenMs >= 2_500 }.forEach { host in
            signals.append(
                OperatorSignal(
                    id: "\(host.id)-ollama-latency",
                    title: "Model latency watch",
                    detail: "\(host.name) is reporting \(host.ollamaTimeToFirstTokenMs.formattedCompact) ms time to first token.",
                    tone: .watch
                )
            )
        }

        if signals.isEmpty {
            signals.append(
                OperatorSignal(
                    id: "fleet-clear",
                    title: "Fleet signal clear",
                    detail: "No high-severity pressure signals are present in the current bundle.",
                    tone: .good
                )
            )
        }

        return Array(signals.prefix(8))
    }
}

private extension HostSnapshot {
    init(run: TelemetryRun, index: Int) {
        let context = run.sourceContext
        let hostname = context?.hostname ?? run.name ?? "Host \(index + 1)"
        let gpuModel = run.allocation?.gpuModel ?? context?.gpuName ?? "Host"
        let cpu = context?.cpuUsagePct ?? run.inputPipeline?.cpuPrep ?? 0
        let gpu = run.utilization?.gpuUtil ?? context?.gpuUtilizationPct ?? 0
        let memory = context?.memoryUsedPct ?? context?.linuxUmaMemoryUsedPct ?? 0
        let disk = context?.lakehouseDiskUsedPct ?? context?.diskUsedPct ?? 0
        let rx = context?.networkRxBytesPerSecond ?? 0
        let tx = context?.networkTxBytesPerSecond ?? 0
        let efficiency = run.baseline?.gpuEfficiency ?? run.utilization?.usefulCompute ?? 0
        let clockSynchronized = context?.clockSynchronized ?? true
        let inferredHealth = max(0, min(100,
            100
            - max(0, memory - 70) * 0.6
            - max(0, disk - 80) * 0.7
            - (clockSynchronized ? 0 : 15)
        ))
        let serviceNames = (context?.observedServices ?? []).map(\.displayName)
        let hardwareWarning = context?.hardwareFaultLevel.flatMap { level -> String? in
            let normalized = level.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !["", "clear", "healthy", "ok", "unknown"].contains(normalized) else { return nil }
            return "Hardware \(level)"
        }
        let warningList = [
            context?.gpuError,
            context?.gpuDiagnosticsError,
            context?.ollamaProbeError,
            hardwareWarning
        ].compactMap { $0 }.filter { !$0.isEmpty }

        self.init(
            id: run.id ?? hostname,
            name: hostname,
            role: gpuModel,
            status: run.status ?? "Observed",
            cpuPct: cpu.clampedPct,
            gpuPct: gpu.clampedPct,
            memoryPct: memory.clampedPct,
            diskPct: disk.clampedPct,
            networkMBps: max(0, (rx + tx) / 1_000_000),
            networkUtilizationPct: (context?.networkUtilizationPct ?? run.communication?.networkUtilization ?? 0).clampedPct,
            queueMinutes: max(0, run.scheduler?.queueWaitMinutes ?? 0),
            efficiencyPct: efficiency.clampedPct,
            hardwareHealthScore: (context?.hardwareHealthScore ?? inferredHealth).clampedPct,
            hardwareFaultCount: max(0, context?.hardwareFaultCount ?? 0),
            hardwareFaultLevel: context?.hardwareFaultLevel ?? "unknown",
            hardwareRepairAction: context?.hardwareRepairAction ?? "observe",
            clockSynchronized: clockSynchronized,
            uptimeSeconds: max(0, context?.uptimeSeconds ?? 0),
            gpuMemoryPct: (context?.gpuMemoryUsedPct ?? 0).clampedPct,
            gpuPowerWatts: max(0, context?.gpuPowerWatts ?? 0),
            gpuTemperatureC: max(0, context?.gpuTemperatureC ?? 0),
            gpuProcessSummary: context?.gpuProcessInspectorSummary ?? "",
            gpuThermalSummary: context?.gpuThermalQualificationSummary ?? "",
            gpuTopologySummary: context?.gpuTopologySummary ?? "",
            ollamaStatus: context?.ollamaTelemetryStatus ?? "",
            ollamaTokensPerSecond: max(0, context?.ollamaTokensPerSecond ?? 0),
            ollamaTimeToFirstTokenMs: max(0, context?.ollamaTimeToFirstTokenMs ?? 0),
            ncclRuntimeStatus: context?.ncclRuntimeStatus ?? "",
            ncclRuntimeDetail: context?.ncclRuntimeDetail ?? "",
            networkInterface: context?.networkInterface ?? "",
            networkLocalAddress: context?.networkLocalAddress ?? "",
            networkLinkSpeedMbps: max(0, context?.networkLinkSpeedMbps ?? 0),
            observedServices: serviceNames,
            warnings: Array(warningList.prefix(4)),
            detail: context?.clockSyncDetail ?? run.importedSources?.joined(separator: ", ") ?? "Telemetry bundle"
        )
    }
}

private struct TelemetryBundle: Decodable {
    let metadata: BundleMetadata?
    let ingestion: IngestionEnvelope?
}

private struct BundleMetadata: Decodable {
    let generatedAt: String?
    let source: String?
    let observedHost: String?
    let sourceAdapters: [String]?
}

private struct IngestionEnvelope: Decodable {
    let runs: [TelemetryRun]?
}

private struct TelemetryRun: Decodable {
    let id: String?
    let name: String?
    let status: String?
    let importedSources: [String]?
    let allocation: Allocation?
    let utilization: Utilization?
    let communication: Communication?
    let inputPipeline: InputPipeline?
    let scheduler: Scheduler?
    let baseline: Baseline?
    let sourceContext: SourceContext?
}

private struct Allocation: Decodable {
    let gpus: Double?
    let gpuModel: String?
}

private struct Utilization: Decodable {
    let gpuUtil: Double?
    let usefulCompute: Double?
}

private struct Communication: Decodable {
    let networkUtilization: Double?
}

private struct InputPipeline: Decodable {
    let cpuPrep: Double?
}

private struct Scheduler: Decodable {
    let queueWaitMinutes: Double?
}

private struct Baseline: Decodable {
    let gpuEfficiency: Double?
}

private struct SourceContext: Decodable {
    let hostname: String?
    let uptimeSeconds: Double?
    let cpuUsagePct: Double?
    let memoryUsedPct: Double?
    let linuxUmaMemoryUsedPct: Double?
    let diskUsedPct: Double?
    let lakehouseDiskUsedPct: Double?
    let networkRxBytesPerSecond: Double?
    let networkTxBytesPerSecond: Double?
    let networkUtilizationPct: Double?
    let networkInterface: String?
    let networkLocalAddress: String?
    let networkLinkSpeedMbps: Double?
    let clockSynchronized: Bool?
    let clockSyncDetail: String?
    let observedServices: [ObservedService]?
    let hardwareHealthScore: Double?
    let hardwareFaultCount: Int?
    let hardwareFaultLevel: String?
    let hardwareRepairAction: String?
    let gpuName: String?
    let gpuUtilizationPct: Double?
    let gpuMemoryUsedPct: Double?
    let gpuPowerWatts: Double?
    let gpuTemperatureC: Double?
    let gpuError: String?
    let gpuDiagnosticsError: String?
    let gpuProcessInspectorSummary: String?
    let gpuThermalQualificationSummary: String?
    let gpuTopologySummary: String?
    let ollamaTelemetryStatus: String?
    let ollamaTokensPerSecond: Double?
    let ollamaTimeToFirstTokenMs: Double?
    let ollamaProbeError: String?
    let ncclRuntimeStatus: String?
    let ncclRuntimeDetail: String?

    private enum CodingKeys: String, CodingKey {
        case hostname
        case uptimeSeconds
        case cpuUsagePct
        case memoryUsedPct
        case linuxUmaMemoryUsedPct
        case diskUsedPct
        case lakehouseDiskUsedPct
        case networkRxBytesPerSecond
        case networkTxBytesPerSecond
        case networkUtilizationPct
        case networkInterface
        case networkLocalAddress
        case networkLinkSpeedMbps
        case clockSynchronized
        case clockSyncDetail
        case observedServices
        case hardwareHealthScore
        case hardwareFaultCount
        case hardwareFaultLevel
        case hardwareRepairAction
        case gpuName
        case gpuUtilizationPct
        case gpuMemoryUsedPct
        case gpuPowerWatts
        case gpuTemperatureC
        case gpuError
        case gpuDiagnosticsError
        case gpuProcessInspectorSummary
        case gpuThermalQualificationSummary
        case gpuTopologySummary
        case ollamaTelemetryStatus
        case ollamaTokensPerSecond
        case ollamaTimeToFirstTokenMs
        case ollamaProbeError
        case ncclRuntimeStatus
        case ncclRuntimeDetail
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        hostname = container.decodeString(.hostname)
        uptimeSeconds = container.decodeDouble(.uptimeSeconds)
        cpuUsagePct = container.decodeDouble(.cpuUsagePct)
        memoryUsedPct = container.decodeDouble(.memoryUsedPct)
        linuxUmaMemoryUsedPct = container.decodeDouble(.linuxUmaMemoryUsedPct)
        diskUsedPct = container.decodeDouble(.diskUsedPct)
        lakehouseDiskUsedPct = container.decodeDouble(.lakehouseDiskUsedPct)
        networkRxBytesPerSecond = container.decodeDouble(.networkRxBytesPerSecond)
        networkTxBytesPerSecond = container.decodeDouble(.networkTxBytesPerSecond)
        networkUtilizationPct = container.decodeDouble(.networkUtilizationPct)
        networkInterface = container.decodeString(.networkInterface)
        networkLocalAddress = container.decodeString(.networkLocalAddress)
        networkLinkSpeedMbps = container.decodeDouble(.networkLinkSpeedMbps)
        clockSynchronized = container.decodeBool(.clockSynchronized)
        clockSyncDetail = container.decodeString(.clockSyncDetail)
        observedServices = try? container.decode([ObservedService].self, forKey: .observedServices)
        hardwareHealthScore = container.decodeDouble(.hardwareHealthScore)
        hardwareFaultCount = container.decodeInt(.hardwareFaultCount)
        hardwareFaultLevel = container.decodeString(.hardwareFaultLevel)
        hardwareRepairAction = container.decodeString(.hardwareRepairAction)
        gpuName = container.decodeString(.gpuName)
        gpuUtilizationPct = container.decodeDouble(.gpuUtilizationPct)
        gpuMemoryUsedPct = container.decodeDouble(.gpuMemoryUsedPct)
        gpuPowerWatts = container.decodeDouble(.gpuPowerWatts)
        gpuTemperatureC = container.decodeDouble(.gpuTemperatureC)
        gpuError = container.decodeString(.gpuError)
        gpuDiagnosticsError = container.decodeString(.gpuDiagnosticsError)
        gpuProcessInspectorSummary = container.decodeString(.gpuProcessInspectorSummary)
        gpuThermalQualificationSummary = container.decodeString(.gpuThermalQualificationSummary)
        gpuTopologySummary = container.decodeString(.gpuTopologySummary)
        ollamaTelemetryStatus = container.decodeString(.ollamaTelemetryStatus)
        ollamaTokensPerSecond = container.decodeDouble(.ollamaTokensPerSecond)
        ollamaTimeToFirstTokenMs = container.decodeDouble(.ollamaTimeToFirstTokenMs)
        ollamaProbeError = container.decodeString(.ollamaProbeError)
        ncclRuntimeStatus = container.decodeString(.ncclRuntimeStatus)
        ncclRuntimeDetail = container.decodeString(.ncclRuntimeDetail)
    }
}

private struct ObservedService: Decodable {
    let name: String
    let status: String

    var displayName: String {
        if status.isEmpty { return name }
        return "\(name): \(status)"
    }

    init(from decoder: Decoder) throws {
        if let value = try? decoder.singleValueContainer().decode(String.self) {
            self.name = value
            self.status = ""
            return
        }

        let container = try decoder.container(keyedBy: DynamicCodingKey.self)
        self.name = container.decodeString("name")
            ?? container.decodeString("service")
            ?? container.decodeString("label")
            ?? "service"

        if let status = container.decodeString("status") {
            self.status = status
        } else if let reachable = container.decodeBool("reachable") {
            self.status = reachable ? "up" : "down"
        } else {
            self.status = ""
        }
    }
}

private struct DynamicCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        self.intValue = nil
    }

    init?(intValue: Int) {
        self.stringValue = String(intValue)
        self.intValue = intValue
    }
}

extension HostSnapshot {
    var riskTone: SignalTone {
        if hardwareFaultCount > 0 || hardwareHealthScore < 60 || memoryPct >= 90 || diskPct >= 90 {
            return .poor
        }
        let thermal = gpuThermalSummary.lowercased()
        if thermal.contains("throttle")
            && !thermal.contains("no throttle")
            && !thermal.contains("throttle active: false") {
            return .poor
        }
        if !clockSynchronized || memoryPct >= 80 || diskPct >= 80 || queueMinutes > 0 || hardwareHealthScore < 80 {
            return .watch
        }
        if hasGpuEvidence && gpuPct < 10 {
            return .watch
        }
        return .good
    }

    var riskLabel: String {
        switch riskTone {
        case .good:
            return "Healthy"
        case .watch:
            return "Watch"
        case .poor:
            return "Action"
        }
    }

    var primaryAction: String {
        if !hardwareRepairAction.isEmpty && hardwareRepairAction != "observe" {
            return hardwareRepairAction.replacingOccurrences(of: "-", with: " ").capitalized
        }
        if hardwareFaultCount > 0 {
            return "Review hardware fault evidence before scheduling new workload."
        }
        if memoryPct >= 90 {
            return "Reduce memory pressure or drain low-priority workload."
        }
        if diskPct >= 90 {
            return "Clear disk pressure before ingestion or benchmark collection."
        }
        if !clockSynchronized {
            return "Restore clock sync before comparing benchmark evidence."
        }
        if hasGpuEvidence && gpuPct < 10 {
            return "Check queue, placement, input pipeline, and model server state."
        }
        if queueMinutes > 0 {
            return "Review queue delay and placement locality."
        }
        return "Continue observing."
    }

    var hasGpuEvidence: Bool {
        gpuPct > 0 || gpuMemoryPct > 0 || gpuPowerWatts > 0 || role.localizedCaseInsensitiveContains("GPU")
    }

    var serviceSummary: String {
        observedServices.isEmpty ? "No service probe rows" : observedServices.joined(separator: ", ")
    }

    var customerRiskPriority: Int {
        switch riskTone {
        case .poor:
            return 3
        case .watch:
            return 2
        case .good:
            return 1
        }
    }

    var customerExplanationSentence: String {
        var reasons: [String] = []
        if hardwareFaultCount > 0 {
            reasons.append("\(hardwareFaultCount) hardware fault\(hardwareFaultCount == 1 ? "" : "s") reported")
        }
        if hardwareHealthScore < 80 {
            reasons.append("health is \(hardwareHealthScore.formattedPct)")
        }
        if memoryPct >= 80 {
            reasons.append("memory is \(memoryPct.formattedPct)")
        }
        if diskPct >= 80 {
            reasons.append("disk is \(diskPct.formattedPct)")
        }
        if queueMinutes > 0 {
            reasons.append("queue wait is \(queueMinutes.formattedCompact) minutes")
        }
        if !clockSynchronized {
            reasons.append("clock sync is not confirmed")
        }

        let thermal = gpuThermalSummary.lowercased()
        if thermal.contains("throttle")
            && !thermal.contains("no throttle")
            && !thermal.contains("throttle active: false") {
            reasons.append("GPU thermal throttling is suspected")
        }
        if hasGpuEvidence && gpuPct < 10 {
            reasons.append("GPU activity is only \(gpuPct.formattedPct)")
        }

        if reasons.isEmpty {
            return "\(name) is healthy; telemetry is inside expected operating bounds."
        }
        return "\(name) is \(riskLabel.lowercased()) because \(reasons.joined(separator: ", "))."
    }
}

extension AnalyticsSnapshot {
    var isStale: Bool {
        guard let generatedAtDate else { return false }
        return Date().timeIntervalSince(generatedAtDate) > 120
    }

    var freshnessLabel: String {
        guard let generatedAtDate else { return generatedAt }
        return TelemetryDateParser.relativeFormatter.localizedString(for: generatedAtDate, relativeTo: Date())
    }

    var customerReportText: String {
        let hostLines = hosts.map { host in
            "- \(host.name): \(host.riskLabel), health \(host.hardwareHealthScore.formattedPct), CPU \(host.cpuPct.formattedPct), GPU \(host.gpuPct.formattedPct), memory \(host.memoryPct.formattedPct), disk \(host.diskPct.formattedPct). \(host.primaryAction)"
        }.joined(separator: "\n")

        let signalLines = signals.map { signal in
            "- \(signal.title): \(signal.detail)"
        }.joined(separator: "\n")

        return """
        turbalance customer report
        Generated: \(Self.reportDateFormatter.string(from: Date()))
        Telemetry: \(sourceLabel), \(freshnessLabel)
        Observed host: \(observedHost)

        Fleet posture: \(customerPosture)
        Hosts: \(summary.hostCount)
        GPU hosts: \(summary.gpuCount)
        Average health: \(summary.averageHealthScore.formattedPct)
        Average GPU: \(summary.averageGpuPct.formattedPct)
        Average CPU: \(summary.averageCpuPct.formattedPct)
        Average memory: \(summary.averageMemoryPct.formattedPct)
        Average disk: \(summary.averageDiskPct.formattedPct)
        Network throughput: \(summary.totalNetworkMBps.formattedCompact) MB/s
        Max queue wait: \(summary.maxQueueMinutes.formattedCompact) minutes

        What is going on:
        \(customerExplanationLines.joined(separator: "\n"))

        Recommended next steps:
        \(customerNextStepLines.joined(separator: "\n"))

        Current signals:
        \(signalLines.isEmpty ? "- No active signals." : signalLines)

        Host summary:
        \(hostLines.isEmpty ? "- No host rows were available in this bundle." : hostLines)
        """
    }

    private var customerPosture: String {
        if summary.actionCount > 0 {
            return "Action required"
        }
        if summary.watchCount > 0 {
            return "Watch"
        }
        return "Healthy"
    }

    private var customerExplanationLines: [String] {
        guard !hosts.isEmpty else {
            return ["- No host telemetry rows were available in this bundle, so the report cannot explain fleet behavior yet."]
        }

        var lines: [String] = []
        if isStale {
            lines.append("- The telemetry feed is stale, so the report may describe a previous fleet state rather than the current moment.")
        }

        if summary.actionCount > 0 {
            lines.append("- The fleet is marked action required because \(summary.actionCount) host\(summary.actionCount == 1 ? "" : "s") crossed a hard health, memory, disk, thermal, or hardware-fault condition.")
        } else if summary.watchCount > 0 {
            lines.append("- The fleet is in watch mode because \(summary.watchCount) host\(summary.watchCount == 1 ? "" : "s") has early warning pressure such as queue delay, clock drift, low GPU activity, or reduced health.")
        } else {
            lines.append("- The fleet is healthy: no configured high-severity host condition is currently active.")
        }

        if summary.maxQueueMinutes > 0 {
            lines.append("- Work is waiting in queue for up to \(summary.maxQueueMinutes.formattedCompact) minutes, which usually means placement, scheduler capacity, or input-pipeline locality needs review.")
        }
        if summary.averageMemoryPct >= 80 {
            lines.append("- Average memory pressure is elevated at \(summary.averageMemoryPct.formattedPct), so workload packing or memory-heavy services may be constraining throughput.")
        }
        if summary.averageDiskPct >= 80 {
            lines.append("- Average disk pressure is elevated at \(summary.averageDiskPct.formattedPct), which can slow ingestion and reduce benchmark confidence.")
        }
        if summary.averageHealthScore < 80 {
            lines.append("- Average fleet health is \(summary.averageHealthScore.formattedPct), so the customer should treat the current evidence as an operational finding instead of a clean capacity baseline.")
        }
        if summary.gpuCount > 0 && summary.averageGpuPct < 15 {
            lines.append("- GPU utilization is low across the sampled fleet even though GPU hosts are present, suggesting possible scheduler, model-server, or data-feed underuse.")
        }

        prioritizedHosts.prefix(3).forEach { host in
            lines.append("- \(host.customerExplanationSentence)")
        }

        return lines
    }

    private var customerNextStepLines: [String] {
        let riskyHosts = prioritizedHosts.filter { $0.riskTone != .good }
        guard !riskyHosts.isEmpty else {
            return ["- Continue normal monitoring and use this report as the customer baseline for the current telemetry window."]
        }

        var lines = riskyHosts.prefix(4).map { host in
            "- \(host.name): \(host.primaryAction)"
        }
        if isStale {
            lines.insert("- Refresh live telemetry before making customer-facing commitments.", at: 0)
        }
        return lines
    }

    private var prioritizedHosts: [HostSnapshot] {
        hosts.sorted { lhs, rhs in
            if lhs.customerRiskPriority != rhs.customerRiskPriority {
                return lhs.customerRiskPriority > rhs.customerRiskPriority
            }
            return lhs.hardwareHealthScore < rhs.hardwareHealthScore
        }
    }

    private static let reportDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}

private enum DeviceUserProfileProvider {
    static func loadProfile(displayName: String?, imageData: Data?) async -> DeviceUserProfile {
        DeviceUserProfile.fallback(displayName: displayName, imageData: imageData)
    }
}

extension NotificationThresholdSettings {
    func breaches(in snapshot: AnalyticsSnapshot) -> [ThresholdBreach] {
        var breaches: [ThresholdBreach] = []

        if snapshot.summary.averageCpuPct >= cpuPct {
            breaches.append(
                ThresholdBreach(
                    id: "fleet-cpu",
                    title: "CPU threshold crossed",
                    detail: "Average fleet CPU is \(snapshot.summary.averageCpuPct.formattedPct), above the \(cpuPct.formattedPct) alert threshold.",
                    tone: .watch
                )
            )
        }

        if snapshot.summary.averageGpuPct >= gpuPct {
            breaches.append(
                ThresholdBreach(
                    id: "fleet-gpu",
                    title: "GPU threshold crossed",
                    detail: "Average fleet GPU is \(snapshot.summary.averageGpuPct.formattedPct), above the \(gpuPct.formattedPct) alert threshold.",
                    tone: .watch
                )
            )
        }

        if snapshot.summary.averageMemoryPct >= memoryPct {
            breaches.append(
                ThresholdBreach(
                    id: "fleet-memory",
                    title: "Memory threshold crossed",
                    detail: "Average memory pressure is \(snapshot.summary.averageMemoryPct.formattedPct), above the \(memoryPct.formattedPct) alert threshold.",
                    tone: .poor
                )
            )
        }

        if snapshot.summary.averageDiskPct >= diskPct {
            breaches.append(
                ThresholdBreach(
                    id: "fleet-disk",
                    title: "Disk threshold crossed",
                    detail: "Average disk pressure is \(snapshot.summary.averageDiskPct.formattedPct), above the \(diskPct.formattedPct) alert threshold.",
                    tone: .poor
                )
            )
        }

        if snapshot.summary.averageHealthScore <= healthScore {
            breaches.append(
                ThresholdBreach(
                    id: "fleet-health",
                    title: "Health threshold crossed",
                    detail: "Average health is \(snapshot.summary.averageHealthScore.formattedPct), below the \(healthScore.formattedPct) alert threshold.",
                    tone: .poor
                )
            )
        }

        if snapshot.summary.maxQueueMinutes >= queueMinutes {
            breaches.append(
                ThresholdBreach(
                    id: "fleet-queue",
                    title: "Queue threshold crossed",
                    detail: "Max queue wait is \(snapshot.summary.maxQueueMinutes.formattedCompact) minutes, above the \(queueMinutes.formattedCompact) minute threshold.",
                    tone: .watch
                )
            )
        }

        if snapshot.summary.totalNetworkMBps >= networkMBps {
            breaches.append(
                ThresholdBreach(
                    id: "fleet-network",
                    title: "Network threshold crossed",
                    detail: "Fleet throughput is \(snapshot.summary.totalNetworkMBps.formattedCompact) MB/s, above the \(networkMBps.formattedCompact) MB/s threshold.",
                    tone: .watch
                )
            )
        }

        snapshot.hosts.filter { $0.riskTone == .poor }.prefix(3).forEach { host in
            breaches.append(
                ThresholdBreach(
                    id: "host-\(host.id)",
                    title: "\(host.name) needs action",
                    detail: host.primaryAction,
                    tone: .poor
                )
            )
        }

        return breaches
    }
}

extension UNAuthorizationStatus {
    var allowsAlerts: Bool {
        switch self {
        case .authorized, .provisional, .ephemeral:
            return true
        case .notDetermined, .denied:
            return false
        @unknown default:
            return false
        }
    }
}

private enum TelemetryDateParser {
    static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    private static let fractionalISO: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standardISO = ISO8601DateFormatter()

    static func parse(_ value: String) -> Date? {
        if let date = fractionalISO.date(from: value) {
            return date
        }
        return standardISO.date(from: value)
    }
}

private extension Array where Element == HostSnapshot {
    func average(_ keyPath: KeyPath<HostSnapshot, Double>) -> Double {
        guard !isEmpty else { return 0 }
        return reduce(0) { $0 + $1[keyPath: keyPath] } / Double(count)
    }
}

private extension KeyedDecodingContainer {
    func decodeString(_ key: Key) -> String? {
        if let value = try? decode(String.self, forKey: key) {
            return value
        }
        if let value = try? decode(Double.self, forKey: key) {
            return String(value)
        }
        if let value = try? decode(Bool.self, forKey: key) {
            return value ? "true" : "false"
        }
        return nil
    }

    func decodeDouble(_ key: Key) -> Double? {
        if let value = try? decode(Double.self, forKey: key) {
            return value
        }
        if let value = try? decode(Int.self, forKey: key) {
            return Double(value)
        }
        if let value = try? decode(String.self, forKey: key) {
            return Double(value)
        }
        return nil
    }

    func decodeInt(_ key: Key) -> Int? {
        if let value = try? decode(Int.self, forKey: key) {
            return value
        }
        if let value = try? decode(Double.self, forKey: key) {
            return Int(value.rounded())
        }
        if let value = try? decode(String.self, forKey: key) {
            return Int(value) ?? Double(value).map { Int($0.rounded()) }
        }
        return nil
    }

    func decodeBool(_ key: Key) -> Bool? {
        if let value = try? decode(Bool.self, forKey: key) {
            return value
        }
        if let value = try? decode(String.self, forKey: key) {
            switch value.lowercased() {
            case "1", "true", "yes", "on":
                return true
            case "0", "false", "no", "off":
                return false
            default:
                return nil
            }
        }
        return nil
    }
}

private extension KeyedDecodingContainer where Key == DynamicCodingKey {
    func decodeString(_ key: String) -> String? {
        guard let codingKey = DynamicCodingKey(stringValue: key) else { return nil }
        return decodeString(codingKey)
    }

    func decodeBool(_ key: String) -> Bool? {
        guard let codingKey = DynamicCodingKey(stringValue: key) else { return nil }
        return decodeBool(codingKey)
    }
}

extension Double {
    var clampedPct: Double { min(max(self, 0), 100) }

    var formattedPct: String {
        "\(Int(rounded()))%"
    }

    var formattedCompact: String {
        if self >= 100 {
            return String(format: "%.0f", self)
        }
        if self >= 10 {
            return String(format: "%.1f", self)
        }
        return String(format: "%.2f", self)
    }

    var formattedDuration: String {
        if self >= 86_400 {
            return "\(Int(self / 86_400))d"
        }
        if self >= 3_600 {
            return "\(Int(self / 3_600))h"
        }
        if self >= 60 {
            return "\(Int(self / 60))m"
        }
        return "\(Int(self))s"
    }
}
