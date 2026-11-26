use AppleScript version "2.5"
use framework "Foundation"
use scripting additions

-- Alongside Calendar checks today's appointments on this Mac.
-- Only the selected start and end times are placed in the Alongside URL.
on run argv
	if argv is {"--self-test"} then
		set sample to current date
		set sample's time to 3600
		return my reviewURL({sample}, {sample + 1800}, {1}, "apple-busy")
	end if
	set periodChoice to button returned of (display dialog "Which days would you like to check? Next, you’ll choose calendars and appointments." with title "Choose appointments for Alongside" buttons {"Cancel", "Today", "Next seven days"} default button 3 cancel button 1)
	set dayStart to current date
	set dayStart's time to 0
	set dayEnd to dayStart + 36 * hours
	set dayEnd's time to 0
	if periodChoice is "Next seven days" then
		set dayEnd to dayStart + (7 * days) + (6 * hours)
		set dayEnd's time to 0
	end if
	tell application "/System/Applications/Calendar.app" to set calendarNames to name of calendars
	set calendarOptions to {}
	set calendarIndexes to {}
	repeat with i from 1 to count calendarNames
		set calendarName to item i of calendarNames
		if calendarName is not "Alongside reminders" then
			set end of calendarOptions to (i as text) & ". " & calendarName
			set end of calendarIndexes to i
		end if
	end repeat
	if calendarOptions is {} then
		display dialog "There are no appointment calendars to choose from." buttons {"OK"} default button 1
		return
	end if
	set selectedCalendars to choose from list calendarOptions with title "Choose appointments for Alongside" with prompt "Which calendars contain your appointments? Hold Command to select more than one." with multiple selections allowed
	if selectedCalendars is false then return
	set starts to {}
	set ends to {}
	set options to {}
	repeat with chosenCalendar in selectedCalendars
		set calIndex to my indexOf(chosenCalendar as text, calendarOptions)
		set calIndex to item calIndex of calendarIndexes
		tell application "/System/Applications/Calendar.app"
			set matchingEvents to every event of calendar calIndex whose start date < dayEnd and end date > dayStart and allday event is false
			repeat with appt in matchingEvents
				if status of appt is not cancelled then
					set s to start date of appt
					set e to end date of appt
					set n to count starts
					if n is 100 then exit repeat
					set eventName to summary of appt
					if eventName is missing value then set eventName to "Appointment"
					set end of starts to s
					set end of ends to e
					set end of options to ((n + 1) as text) & ". " & (short date string of s) & " " & (time string of s) & " – " & (time string of e) & "   " & eventName
				end if
			end repeat
		end tell
	end repeat
	if options is {} then
		display dialog "No timed appointments were found in those calendars for the days you chose." buttons {"Done"} default button 1
		return
	end if
	set indexes to {}
	if options is not {} then
		set picked to choose from list options with title "Choose busy appointments" with prompt "Select the appointments you want your plan to work around. Hold Command to select more than one. Only their times go to Alongside." with multiple selections allowed and empty selection allowed
		if picked is false then return
		if picked is {} then return
		repeat with choice in picked
			set end of indexes to my indexOf(choice as text, options)
		end repeat
	end if
	set n to count indexes
	display dialog "Open Alongside with " & n & " selected time blocks?" with title "Choose appointments for Alongside" buttons {"Cancel", "Open Alongside"} default button 2 cancel button 1
	set fragmentName to "apple-busy"
	if periodChoice is "Next seven days" then set fragmentName to "week-busy"
	open location my reviewURL(starts, ends, indexes, fragmentName)
end run

on indexOf(needle, haystack)
	repeat with i from 1 to count haystack
		if item i of haystack is needle then return i
	end repeat
	error "The chosen appointment list changed. Run the check again."
end indexOf

on reviewURL(starts, ends, indexes, fragmentName)
	set formatter to current application's NSDateFormatter's new()
	formatter's setLocale:(current application's NSLocale's localeWithLocaleIdentifier:"en_US_POSIX")
	formatter's setTimeZone:(current application's NSTimeZone's timeZoneWithAbbreviation:"UTC")
	formatter's setDateFormat:"yyyy-MM-dd'T'HH:mm:ss'Z'"
	set spans to current application's NSMutableArray's array()
	repeat with idx in indexes
		set a to (formatter's stringFromDate:(item (idx as integer) of starts)) as text
		set b to (formatter's stringFromDate:(item (idx as integer) of ends)) as text
		(spans's addObject:(a & "|" & b))
	end repeat
	set payload to spans's componentsJoinedByString:linefeed
	set encoded to payload's stringByAddingPercentEncodingWithAllowedCharacters:(current application's NSCharacterSet's alphanumericCharacterSet())
	return "https://hintofhala21.github.io/alongside/#" & fragmentName & "=" & (encoded as text)
end reviewURL
