# Scanner Setup & GVM Integration

To ensure the DRPE platform can successfully trigger scans and fetch results, the bridge to the Kali Linux / OpenVAS (GVM) instance must be correctly configured.

## 1. Prerequisites
- **Kali Linux** with `gvm` (OpenVAS) installed and running.
- **SSH access** enabled on Kali (`sudo systemctl enable ssh --now`).
- **GVM-CLI** installed on Kali (`pip install gvm-tools`).

## 2. Platform Credentials
Configure the following in your `backend/.env` file:

```bash
# Kali SSH Connectivity
KALI_HOST=192.168.x.x
KALI_USER=kali
KALI_PASSWORD=kali

# GVM Manager Credentials
GVM_USERNAME=admin
GVM_PASSWORD=your_password
GVM_SOCKET_PATH=/run/gvmd/gvmd.sock
```

## 3. Communication Channel
The orchestrator communicates with Kali via **SSH**.
- The backend sends a request to Kali over SSH.
- On Kali, the command `gvm-cli` is executed locally against the unix socket.
- This architectural design allows the DRPE API to be hosted anywhere while the heavy scanning occurs on a dedicated security node.

## 4. Troubleshooting
If scan counts show **0 assets**:
- Ensure the **Background Poller** in `main.py` is enabled (it should be enabled by default).
- Verify the SSH credentials in `.env`.
- Check if the `gvmd` service on Kali is responsive by running `gvmd --get-tasks` locally on the Kali machine.
