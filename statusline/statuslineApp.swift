//
//  statuslineApp.swift
//  statusline
//
//  Created by cuquito on 27/8/26.
//

import SwiftUI

@main
struct statuslineApp: App {
    @UIApplicationDelegateAdaptor(StatuslineAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
