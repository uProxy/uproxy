import { MakeCoreConnector } from './cordova_core_connector';

import { VpnDevice } from '../model/vpn_device';
import * as net from '../../lib/net/net.types';
import { CloudSocksProxyServer, SocksProxyServerRepository } from './cloud_socks_proxy_server';
import { GetGlobalTun2SocksVpnDevice } from './tun2socks_vpn_device';

// For debugging
(window as any).context = this;

let core = MakeCoreConnector();

class EventLog {
  constructor(private element_: HTMLElement) {}

  public append(text: string) {
    let wrapped = document.createElement('div');
    wrapped.innerText = text;
    this.element_.appendChild(wrapped);
  }
}

class AppComponent {
  private selectedServerPromise: Promise<CloudSocksProxyServer> = null;
  private proxyEndpoint: net.Endpoint = null;

  private log: EventLog;

  private addWidget: HTMLDivElement;
  private addTokenText: HTMLTextAreaElement;
  private addButton: HTMLButtonElement;
  private startButton: HTMLButtonElement;
  private stopButton: HTMLButtonElement;
  private startVpnButton: HTMLButtonElement;
  private stopVpnButton: HTMLButtonElement;

  constructor(private servers: SocksProxyServerRepository, private vpnDevicePromise: Promise<VpnDevice>) {
    // TODO: Can use root.querySelector() instead to not depend on document. 
    this.log = new EventLog(document.getElementById('event-log'));
    this.addWidget = document.getElementById('setup-widget') as HTMLDivElement;
    this.addTokenText = document.getElementById('token-text') as HTMLTextAreaElement;

    this.addButton = document.getElementById('set-proxy-button') as HTMLButtonElement;
    this.addButton.onclick = (ev) => {
      console.debug('Pressed Add Button');
      this.pressAddServer();
    };

    this.startButton = document.getElementById('start-proxy-button') as HTMLButtonElement;
    this.startButton.onclick = (ev) => {
      console.debug('Pressed Start Button');
      this.pressStart();
    };

    this.stopButton = document.getElementById('stop-proxy-button') as HTMLButtonElement;
    this.stopButton.onclick = (ev) => {
      console.debug('Pressed Stop Button');
    };

    this.startVpnButton = document.getElementById('start-vpn-button') as HTMLButtonElement;
    this.stopVpnButton = document.getElementById('stop-vpn-button') as HTMLButtonElement;

    this.vpnDevicePromise.catch((error) => { this.log.append(error); });
    this.startVpnButton.onclick = (ev) => {
      console.debug('Pressed VPN Start Button');
      this.vpnDevicePromise.then((vpnDevice) => {
        return vpnDevice.start(this.proxyEndpoint.port, ((msg) => {
          this.log.append(`Vpn disconnected: ${msg}`);
        }));
      }).then((msg) => {
        this.log.append(`VPN started: ${msg}`);
      }).catch(console.error);
    };
    this.stopVpnButton.onclick = (ev) => {
      console.debug('Pressed VPN Stop Button');
      this.vpnDevicePromise.then((vpnDevice) => {
        return vpnDevice.stop();
      }).then((msg) => {
        this.log.append(`VPN stopped: ${msg}`);
      }).catch(console.error);
    };
  }

  public enterAccessCode(code: string) {
    this.log.append('Entered access code');
    this.addTokenText.value = code;
  }

  public pressAddServer() {
    this.selectedServerPromise = this.servers.addProxyServer(this.addTokenText.value);
    this.selectedServerPromise.then((server) => {
      this.startButton.disabled = false;
      this.log.append(`Added server at ${server.remoteIpAddress()}`)
    }).catch((error) => {
      console.error(error);
      this.log.append(error);
    });
  }

  public pressStart() {
    if (!this.selectedServerPromise) {
      throw new Error('No proxy set');
    }
    this.selectedServerPromise.then((server) => {
      this.startButton.disabled = true;
      return server.start();
    }).then((endpoint) => {
      this.proxyEndpoint = endpoint;
      console.log('Endpoint: ', endpoint);
      this.log.append(`Proxy running on port ${endpoint.port}`);
      this.stopButton.disabled = false;
    }).catch((error) => {
      console.error(error);
      this.log.append(error);GetGlobalTun2SocksVpnDevice()
      this.startButton.disabled = false;
    });
  }

  public pressStop() {
    if (!this.selectedServerPromise) {
      throw new Error('No proxy set');
    }
    this.selectedServerPromise.then((server) => {
      this.log.append('Proxy stopped');
      return server.stop();
    }).then(() => {
      this.startButton.disabled = false;
      this.stopButton.disabled = true;
    }).catch(console.error);
  }
}

function main() {
  console.debug('Starting main()');
  let app = new AppComponent(new SocksProxyServerRepository(core), GetGlobalTun2SocksVpnDevice());
  chrome.runtime.getBackgroundPage((bgPage) => {
    (<any>bgPage).ui_context.getIntentUrl().then((url: string) => {
       console.debug(`[Context] Url: ${url}`);
       app.enterAccessCode(url);
    });
  });
}

document.addEventListener('DOMContentLoaded', function (event) {
  // TODO(fortuna): For some reason I'm getting:
  // "TypeError: Cannot read property 'acceptInvitation' of null"
  // If I click "Set Proxy" too soon after the splash screen.
  core.getFullState().then((state) => {
    console.log(state);
    main();
  });
});