//! Shared, OS-independent policy for the companion's transient tray window.
//! Only visibility changes: the refresh worker and pairing are not owned here.
use std::time::Duration;

pub const BLUR_DELAY: Duration = Duration::from_millis(180);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BlurToken(u64);

#[derive(Debug, Default)]
pub struct WindowBehavior {
    generation: u64,
    tray_hovered: bool,
    tray_pressed: bool,
    dialog_open: bool,
}

impl WindowBehavior {
    // Focus gain, explicit show/hide and newer interactions cancel older timers.
    pub fn cancel_pending(&mut self) {
        self.generation = self.generation.wrapping_add(1);
    }

    pub fn request_blur(&mut self) -> Option<BlurToken> {
        self.cancel_pending();
        self.can_auto_hide().then_some(BlurToken(self.generation))
    }

    pub fn should_hide(&self, token: BlurToken, visible: bool, focused: bool) -> bool {
        token.0 == self.generation && visible && !focused && self.can_auto_hide()
    }

    pub fn set_tray_hovered(&mut self, hovered: bool) {
        self.cancel_pending();
        self.tray_hovered = hovered;
        if !hovered {
            // A press dragged off the icon may not deliver its release to us.
            self.tray_pressed = false;
        }
    }

    pub fn set_tray_pressed(&mut self, pressed: bool) {
        self.cancel_pending();
        self.tray_pressed = pressed;
    }

    pub fn toggle_visibility(&mut self, visible: bool) -> Option<bool> {
        self.cancel_pending();
        (!self.dialog_open).then_some(!visible)
    }

    pub fn begin_dialog(&mut self) -> bool {
        self.cancel_pending();
        if self.dialog_open {
            return false;
        }
        self.dialog_open = true;
        true
    }

    pub fn end_dialog(&mut self) {
        self.cancel_pending();
        self.dialog_open = false;
    }

    pub fn can_explicitly_hide(&self) -> bool {
        !self.dialog_open
    }

    fn can_auto_hide(&self) -> bool {
        !self.dialog_open && !self.tray_hovered && !self.tray_pressed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outside_click_hides_on_every_platform() {
        let mut behavior = WindowBehavior::default();
        let token = behavior.request_blur().unwrap();
        assert!(behavior.should_hide(token, true, false));
        assert!(!behavior.should_hide(token, true, true));
        assert!(!behavior.should_hide(token, false, false));
    }

    #[test]
    fn returning_focus_or_explicitly_reopening_cancels_the_old_timer() {
        let mut behavior = WindowBehavior::default();
        let old = behavior.request_blur().unwrap();
        behavior.cancel_pending();
        assert!(!behavior.should_hide(old, true, false));
        let current = behavior.request_blur().unwrap();
        assert!(!behavior.should_hide(old, true, false));
        assert!(behavior.should_hide(current, true, false));
    }

    #[test]
    fn tray_click_after_blur_closes_once_instead_of_reopening() {
        let mut behavior = WindowBehavior::default();
        let old = behavior.request_blur().unwrap();
        behavior.set_tray_hovered(true);
        behavior.set_tray_pressed(true);
        assert!(behavior.request_blur().is_none());
        assert!(!behavior.should_hide(old, true, false));
        behavior.set_tray_pressed(false);
        assert_eq!(behavior.toggle_visibility(true), Some(false));
        assert_eq!(behavior.toggle_visibility(false), Some(true));
    }

    #[test]
    fn a_slow_tray_press_or_drag_does_not_reopen_an_auto_hidden_window() {
        let mut behavior = WindowBehavior::default();
        behavior.set_tray_pressed(true);
        assert!(behavior.request_blur().is_none());
        behavior.set_tray_hovered(false);
        let token = behavior.request_blur().unwrap();
        assert!(behavior.should_hide(token, true, false));
    }

    #[test]
    fn leaving_tray_resumes_auto_hide_only_when_focus_is_elsewhere() {
        let mut behavior = WindowBehavior::default();
        behavior.set_tray_hovered(true);
        assert!(behavior.request_blur().is_none());
        behavior.set_tray_hovered(false);
        let token = behavior.request_blur().unwrap();
        assert!(!behavior.should_hide(token, true, true));
        assert!(behavior.should_hide(token, true, false));
    }

    #[test]
    fn native_file_picker_keeps_its_parent_visible_and_blocks_duplicate_dialogs() {
        let mut behavior = WindowBehavior::default();
        let old = behavior.request_blur().unwrap();
        assert!(behavior.begin_dialog());
        assert!(!behavior.begin_dialog());
        assert!(!behavior.should_hide(old, true, false));
        assert!(behavior.request_blur().is_none());
        assert_eq!(behavior.toggle_visibility(true), None);
        assert!(!behavior.can_explicitly_hide());
    }

    #[test]
    fn picker_completion_or_cancellation_restores_normal_dismissal() {
        let mut behavior = WindowBehavior::default();
        behavior.begin_dialog();
        behavior.end_dialog();
        assert!(behavior.can_explicitly_hide());
        let token = behavior.request_blur().unwrap();
        assert!(!behavior.should_hide(token, true, true));
        assert!(behavior.should_hide(token, true, false));
        assert!(behavior.begin_dialog());
    }
}
