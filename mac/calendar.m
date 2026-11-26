#import <AppKit/AppKit.h>
#import <EventKit/EventKit.h>

static NSTask *planner;
static void notice(NSString *message) {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Alongside Calendar";
    alert.informativeText = message;
    [alert runModal];
}
static void startPlanner(void) {
    NSURL *root = NSBundle.mainBundle.bundleURL.URLByDeletingLastPathComponent.URLByDeletingLastPathComponent.URLByDeletingLastPathComponent;
    NSString *node = [NSHomeDirectory() stringByAppendingPathComponent:@".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"];
    for (NSString *path in @[@"/opt/homebrew/bin/node", @"/usr/local/bin/node"]) {
        if ([[NSFileManager defaultManager] isExecutableFileAtPath:path]) { node=path; break; }
    }
    planner = [[NSTask alloc] init];
    planner.executableURL = [NSURL fileURLWithPath:node];
    planner.currentDirectoryURL = root;
    planner.arguments = @[@"scripts/preview.mjs"];
    NSMutableDictionary *env = [NSProcessInfo.processInfo.environment mutableCopy];
    env[@"ALONGSIDE_MAC_CALENDAR"] = @"1";
    planner.environment = env;
    NSError *error=nil;
    if (![planner launchAndReturnError:&error]) {
        notice(@"Alongside could not start its planner on this Mac."); exit(1);
    }
}
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        BOOL reader = argc == 2 && strcmp(argv[1], "--busy") == 0;
        BOOL adding = argc == 4 && strcmp(argv[1], "--add-meal") == 0;
        NSString *meal = adding ? [NSString stringWithUTF8String:argv[2]] : nil;
        NSDate *when = adding ? [NSDate dateWithTimeIntervalSince1970:atof(argv[3])] : nil;
        if (adding && (![@[@"Breakfast",@"Morning snack",@"Lunch",@"Afternoon snack",@"Dinner",@"Evening snack",@"Night snack",@"Snack"] containsObject:meal] || when.timeIntervalSinceNow <= 0)) return 4;
        BOOL command = reader || adding;
        if (!command) {
            [NSApplication sharedApplication];
            [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
            [NSApp finishLaunching];
            [NSApp activateIgnoringOtherApps:YES];
        }
        EKEventStore *store = [[EKEventStore alloc] init];
        [store requestFullAccessToEventsWithCompletion:^(BOOL granted, NSError *error) {
            if (!granted || error) {
                fprintf(stderr, "Calendar permission status %ld; EventKit error %s %ld\n",
                        (long)[EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent],
                        error.domain.UTF8String ?: "none", (long)error.code);
                if (!command) { dispatch_async(dispatch_get_main_queue(), ^{ notice(@"Calendar access is unavailable. You can close this message and try opening Alongside Calendar again."); exit(2); }); return; }
                exit([EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent] == EKAuthorizationStatusDenied ? 2 : 3);
            }
            if (!command) {
                dispatch_async(dispatch_get_main_queue(), ^{ startPlanner(); });
                return;
            }
            if (adding) {
                EKCalendar *calendar = store.defaultCalendarForNewEvents;
                if (!calendar || !calendar.allowsContentModifications) exit(4);
                NSPredicate *sameTime = [store predicateForEventsWithStartDate:when endDate:[when dateByAddingTimeInterval:1] calendars:@[calendar]];
                for (EKEvent *existing in [store eventsMatchingPredicate:sameTime]) {
                    if ([existing.title isEqualToString:meal] && [existing.startDate isEqualToDate:when]) {
                        for (EKAlarm *alarm in existing.alarms) {
                            if (!alarm.absoluteDate && alarm.relativeOffset == 0) exit(0);
                        }
                        [existing addAlarm:[EKAlarm alarmWithRelativeOffset:0]];
                        exit([store saveEvent:existing span:EKSpanThisEvent error:nil] ? 0 : 4);
                    }
                }
                EKEvent *event = [EKEvent eventWithEventStore:store];
                event.calendar = calendar;
                event.title = meal;
                event.startDate = when;
                event.endDate = [when dateByAddingTimeInterval:300];
                [event addAlarm:[EKAlarm alarmWithRelativeOffset:0]];
                exit([store saveEvent:event span:EKSpanThisEvent error:nil] ? 0 : 4);
            }
            NSDate *start = [NSDate dateWithTimeIntervalSinceNow:-86400];
            NSDate *end = [NSDate dateWithTimeIntervalSinceNow:9*86400];
            NSPredicate *query = [store predicateForEventsWithStartDate:start endDate:end calendars:nil];
            NSMutableArray *times = [NSMutableArray array];
            for (EKEvent *event in [store eventsMatchingPredicate:query]) {
                if (event.status == EKEventStatusCanceled || event.availability == EKEventAvailabilityFree ||
                    [event.calendar.title isEqualToString:@"Alongside reminders"]) continue;
                [times addObject:@{@"start": @(event.startDate.timeIntervalSince1970*1000),
                                   @"end": @(event.endDate.timeIntervalSince1970*1000)}];
            }
            NSData *json = [NSJSONSerialization dataWithJSONObject:times options:0 error:nil];
            if (!json) exit(3);
            [[NSFileHandle fileHandleWithStandardOutput] writeData:json];
            exit(0);
        }];
        if (command) [[NSRunLoop currentRunLoop] run]; else [NSApp run];
    }
    return 1;
}
