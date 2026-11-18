"""Blender(MCP for Blender 추가 기능)에 파이썬 파일을 보내 실행한다.

사용법: python tools/blender_run.py <스크립트 경로>
Blender가 열려 있고 MCP 서버(127.0.0.1:9876)가 켜져 있어야 한다.
"""
import json
import socket
import sys
from pathlib import Path


def send(command, params, timeout=600):
    with socket.create_connection(("127.0.0.1", 9876), timeout=timeout) as s:
        s.sendall(json.dumps({"type": command, "params": params}).encode("utf-8"))
        data = b""
        while True:
            chunk = s.recv(1 << 16)
            if not chunk:
                break
            data += chunk
            try:
                return json.loads(data.decode("utf-8"))
            except ValueError:
                continue
    return json.loads(data.decode("utf-8"))


if __name__ == "__main__":
    path = Path(sys.argv[1]).resolve()
    code = path.read_text(encoding="utf-8")
    # 스크립트가 자기 위치를 알 수 있게 경로를 넘겨준다
    code = f"__file__ = {str(path)!r}\n" + code
    result = send("execute_code", {"code": code})
    status = result.get("status")
    if status != "success":
        print("실패:", result.get("message") or result)
        sys.exit(1)
    out = (result.get("result") or {}).get("result", "")
    print(out if out else "완료")
