"""Build the editable Apple Shortcuts workflow. Apple signs the distributable separately."""
import argparse
import plistlib
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5


def build():
    actions = []

    def uid(label):
        return str(uuid5(NAMESPACE_URL, 'https://hintofhala21.github.io/alongside/shortcut/' + label)).upper()

    def action(name, label, **params):
        params['UUID'] = uid(label)
        actions.append({'WFWorkflowActionIdentifier': 'is.workflow.actions.' + name,
                        'WFWorkflowActionParameters': params})
        return {'Type': 'ActionOutput', 'OutputUUID': uid(label), 'OutputName': label}

    def token(value):
        return {'WFSerializationType': 'WFTextTokenAttachment', 'Value': value}

    def text(*parts):
        value, attachments = '', {}
        for part in parts:
            if isinstance(part, str):
                value += part
            else:
                attachments['{%d, 1}' % (len(value.encode('utf-16-le')) // 2)] = part
                value += '\ufffc'
        return {'WFSerializationType': 'WFTextTokenString',
                'Value': {'string': value, 'attachmentsByRange': attachments}}

    action('comment', 'Privacy', WFCommentActionText=(
        'Choose appointments that make you unavailable today. Leave Alongside reminders and events marked Free '
        'unselected. Apple Shortcuts reads the events on this device. The Alongside page receives only the '
        'start and end times you select. Run again if your appointments change.'))
    events = action('filter.calendarevents', 'Appointments today', WFContentItemFilter={
        'WFSerializationType': 'WFContentPredicateTableTemplate', 'Value': {
            'WFActionParameterFilterPrefix': 1, 'WFContentPredicateBoundedDate': True,
            'WFActionParameterFilterTemplates': [
                {'Property': 'Start Date', 'Operator': 1002, 'Values': {}, 'Removable': False, 'Bounded': True},
                {'Property': 'Is All Day', 'Operator': 4, 'Values': {'Bool': False}, 'Removable': True},
            ]}}, WFContentItemSortProperty='Start Date', WFContentItemSortOrder='Oldest First',
        WFContentItemLimitEnabled=True, WFContentItemLimitNumber=100)
    selected = action('choosefromlist', 'Selected appointments', WFInput=token(events),
                      WFChooseFromListActionPrompt='Select busy appointments only. Leave Alongside reminders and free events unchecked.',
                      WFChooseFromListActionSelectMultiple=True, WFChooseFromListActionSelectAll=False)
    group = uid('each selected appointment')
    action('repeat.each', 'Appointments', WFInput=token(selected), GroupingIdentifier=group, WFControlFlowMode=0)
    item = token({'Type': 'Variable', 'VariableName': 'Repeat Item'})
    dates = []
    for detail in ['Start Date', 'End Date']:
        date = action('properties.calendarevents', detail, WFContentItemPropertyName=detail, WFInput=item)
        dates.append(action('format.date', detail+' ISO', WFDate=token(date),
                            WFDateFormatStyle='Custom', WFDateFormat="yyyy-MM-dd'T'HH:mm:ssXXX"))
    action('gettext', 'Busy interval', WFTextActionText=text(dates[0], '|', dates[1]))
    ranges = action('repeat.each', 'Selected intervals', GroupingIdentifier=group, WFControlFlowMode=2)
    joined = action('text.combine', 'Interval list', WFText=token(ranges), WFTextSeparator='New Lines')
    encoded = action('urlencode', 'Encoded intervals', WFText=token(joined), WFEncodeMode='Encode')
    url = action('url', 'Alongside', WFURLActionURL=text('https://hintofhala21.github.io/alongside/#apple-busy=', encoded))
    action('openurl', 'Review in Alongside', WFInput=token(url))
    return {'WFWorkflowActions': actions, 'WFWorkflowClientVersion': '4018.0.4',
            'WFWorkflowMinimumClientVersion': 900, 'WFWorkflowMinimumClientVersionString': '900',
            'WFWorkflowName': 'Alongside Calendar', 'WFWorkflowNoInputBehavior': {'Name':'WFWorkflowNoInputBehaviorContinue'},
            'WFWorkflowTypes': [], 'WFQuickActionSurfaces': [], 'WFWorkflowInputContentItemClasses': [],
            'WFWorkflowOutputContentItemClasses': [], 'WFWorkflowImportQuestions': [],
            'WFWorkflowIcon': {'WFWorkflowIconGlyphNumber': 61445, 'WFWorkflowIconStartColor': -14108416}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    args.destination.write_bytes(plistlib.dumps(build(), fmt=plistlib.FMT_BINARY, sort_keys=False))
