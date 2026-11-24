"""Send one owner-only test using Zapier's configured WhatsApp Notifications action."""
import datetime
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def send_test(url):
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.netloc != "mcp.zapier.com" or parts.path != "/api/v1/connect":
        raise ValueError("Expected the private Zapier MCP connection URL.")
    opener = urllib.request.build_opener(NoRedirect)
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}

    def rpc(method, params, request_id=None):
        body = {"jsonrpc": "2.0", "method": method, "params": params}
        if request_id is not None:
            body["id"] = request_id
        request = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
        with opener.open(request, timeout=45) as response:
            if response.headers.get("Mcp-Session-Id"):
                headers["Mcp-Session-Id"] = response.headers["Mcp-Session-Id"]
            if request_id is None:
                return
            if response.headers.get_content_type() == "text/event-stream":
                for line in response:
                    if line.startswith(b"data:"):
                        packet = json.loads(line[5:])
                        if packet.get("id") == request_id:
                            break
                else:
                    raise ValueError("Missing response.")
            else:
                packet = json.load(response)
            if packet.get("id") != request_id or "error" in packet:
                raise ValueError("Zapier could not complete the request.")
            return packet["result"]

    init = rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                              "clientInfo": {"name": "alongside-owner-reminders", "version": "1"}}, 1)
    headers["MCP-Protocol-Version"] = init["protocolVersion"]
    rpc("notifications/initialized", {})
    now = datetime.datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %Z")
    result = rpc("tools/call", {"name": "execute_zapier_write_action", "arguments": {
        "selected_api": "WhatsAppNotificationsCLIAPI", "action": "send_message",
        "tool_name": "whatsapp_notifications_send_message", "params": {
            "template": "calendar_reminder", "event_name": "Meal time",
            "dynamic_properties": {"date_and_time": "Alongside test reminder · " + now}
        }
    }}, 2)
    if result.get("isError"):
        print("Zapier rejected the test. Check the action in your Zapier MCP history.")
        return False
    # A successful action returns a list of records. Never print the records:
    # they may contain the account owner's WhatsApp number.
    for item in result.get("content", []):
        if item.get("type") != "text":
            continue
        try:
            data = json.loads(item["text"])
        except ValueError:
            continue
        if isinstance(data, dict) and data.get("results"):
            print("Zapier accepted the test. Check the linked WhatsApp account for delivery.")
            return True
    print("Zapier returned an unrecognized response. Check MCP history before sending again.")
    return False


if __name__ == "__main__":
    try:
        connection = os.environ.get("ZAPIER_MCP_URL") or getpass.getpass("Private Zapier connection: ")
        sys.exit(0 if send_test(connection.strip()) else 1)
    except (OSError, ValueError, KeyError) as error:
        status = getattr(error, "code", None)
        print("Test could not be confirmed.", "HTTP " + str(status) if status else type(error).__name__)
        sys.exit(1)
