import type { DropReason, Layer } from './model';

/** Plain-language captions and explanations. All user-facing engine text lives here. */

export const LAYER_NAMES: Record<Layer, string> = {
  application: 'Application',
  transport: 'Transport',
  network: 'Network',
  link: 'Link',
};

export interface DropText {
  title: string;
  text: string;
}

export const DROP_TEXT: Record<DropReason, DropText> = {
  'no-ip': {
    title: 'No IP address',
    text: 'This device has no IP address configured, so it cannot send anything.',
  },
  'no-link': {
    title: 'Not connected',
    text: 'There is no cable on this interface, so the packet has nowhere to go.',
  },
  'no-gateway': {
    title: 'No default gateway',
    text: 'The destination is on another network, but this host has no default gateway, so it does not know where to send packets for other networks.',
  },
  'gateway-unreachable': {
    title: 'Gateway not on my network',
    text: 'The gateway address is not on a network this device is directly connected to, so it cannot be reached.',
  },
  'no-route': {
    title: 'No route',
    text: 'The router has no route for the destination network, so it does not know where to forward the packet.',
  },
  'no-arp-reply': {
    title: 'Nobody has that address here',
    text: 'The sender asked its local network for the MAC address of the next hop (ARP), but nobody answered: no device on this network has that IP address. A wrong subnet mask or a wrong address is the usual cause.',
  },
  'arp-not-me': {
    title: 'Not my address',
    text: 'The ARP question asks for a different IP address, so this device ignores it. This is normal.',
  },
  'port-closed': {
    title: 'Port closed',
    text: 'The packet reached the right device, but no application is listening on that port, so it is dropped.',
  },
  'wrong-ip': {
    title: 'Not my IP address',
    text: 'The packet was addressed to this device at the link layer, but its IP address is not ours, and hosts do not forward packets.',
  },
  'wrong-mac': {
    title: 'Not for me',
    text: 'The destination MAC address is not this device, so it ignores the frame. This is normal when a switch floods or a hub repeats.',
  },
  filtered: {
    title: 'Same port',
    text: 'The destination is on the port the frame arrived from, so the switch does not send it back.',
  },
  'no-mapping': {
    title: 'No NAT mapping',
    text: 'The router received this from the outside, but nobody inside started a conversation with that sender, and no port forwarding rule matches. It cannot know which inside device this is for, so it drops it.',
  },
  'no-dns-server': {
    title: 'No DNS server',
    text: 'This computer was asked to find a name, but it does not know the address of any DNS server, so it cannot turn the name into an IP address.',
  },
  'name-not-found': {
    title: 'Unknown name',
    text: 'The DNS server answered that it does not know this name, so there is no IP address to send the message to.',
  },
  broadcast: {
    title: 'Broadcasts stay local',
    text: 'A broadcast is meant for everybody on one network. Routers never forward it to another network.',
  },
  ignored: {
    title: 'Not interested',
    text: 'No application on this computer is waiting for this broadcast, so it ignores it. This is normal.',
  },
  'pool-empty': {
    title: 'No free addresses',
    text: 'The DHCP server has handed out every address in its pool, so it has none left for this computer.',
  },
  loop: {
    title: 'Too many hops',
    text: 'The packet kept travelling without arriving; the simulator stopped it. The network probably contains a loop.',
  },
};

export const captions = {
  create: (device: string, app: string, message: string) =>
    `${device}: the ${app} application creates the message "${message}".`,
  transport: (src: number, dst: number) =>
    `The transport layer adds the ports (${src} → ${dst}), so the message reaches the right application.`,
  network: (src: string, dst: string) =>
    `The network layer adds the IP addresses (${src} → ${dst}), which identify the sender and the final destination.`,
  link: (src: string, dst: string) =>
    `The link layer adds the MAC addresses (${src} → ${dst}) for the next hop on this local network.`,
  arpHit: (device: string, ip: string, mac: string) =>
    `${device} needs the MAC address of ${ip}. Its ARP table already has it: ${mac}.`,
  arpMiss: (device: string, ip: string) =>
    `${device} needs the MAC address of ${ip}, but it is not in its ARP table. The message waits while ${device} asks (ARP).`,
  arpAsk: (device: string, ip: string) => `${device} asks everyone on its network: "Who has ${ip}?"`,
  arpBroadcast: () =>
    'The question goes to the broadcast MAC address FF:FF:FF:FF:FF:FF, so every device on this network receives it.',
  arpAnswer: (device: string, ip: string, mac: string) => `${device} has ${ip}, so it answers: "${ip} is at ${mac}."`,
  arpUnicast: (mac: string) => `The answer goes straight back to the one who asked, ${mac}.`,
  arpNoteAsker: (device: string, ip: string, mac: string) =>
    `${device} also writes down who asked: ${ip} is at ${mac}. It will need that to answer.`,
  arpLearn: (device: string, ip: string, mac: string) =>
    `${device} writes the answer in its ARP table (${ip} → ${mac}) and sends the waiting message.`,
  arpQuiet: (device: string, ip: string, mac: string) =>
    `${device} finds out that ${ip} has MAC address ${mac} on its local network (ARP is hidden).`,
  arpOpen: (device: string) => `${device} opens the frame and finds an ARP message inside.`,
  arpUpdate: (device: string, ip: string, mac: string) => `${device} writes the answer in its ARP table: ${ip} → ${mac}.`,
  transmit: (from: string, to: string) => `The frame travels over the cable from ${from} to ${to}.`,
  open: (device: string, layer: Layer, kind: 'host' | 'switch' | 'hub' | 'router') => {
    if (kind === 'switch')
      return 'The switch only opens the link layer to read the MAC addresses. The inner layers stay sealed.';
    if (kind === 'router' && layer === 'link')
      return `${device} removes the link layer: the MAC addresses only mattered on the previous network.`;
    if (kind === 'router' && layer === 'transport')
      return `${device} also opens the transport layer, because address translation needs the port numbers.`;
    if (kind === 'router')
      return `${device} opens the network layer to read the destination IP address.`;
    return `${device} opens the ${LAYER_NAMES[layer].toLowerCase()} layer.`;
  },
  learn: (mac: string, port: string) =>
    `The switch learns: ${mac} is reachable via port ${port}.`,
  macLookup: (dst: string, port: string | null) =>
    port ? `The switch knows ${dst} is behind port ${port} and forwards the frame only there.` : `The switch has never seen ${dst}.`,
  repeat: (ports: string[]) =>
    ports.length === 0
      ? 'The hub has no other cables, so the frame goes nowhere.'
      : `The hub cannot read addresses, so it repeats the frame out of every other port (${ports.join(', ')}). Everyone connected receives it.`,
  flood: (dst: string, ports: string[]) =>
    dst === 'FF:FF:FF:FF:FF:FF'
      ? `Broadcast address: the switch sends the frame out of all other ports (${ports.join(', ')}).`
      : `The switch does not know where ${dst} is, so it floods: it sends the frame out of all other ports (${ports.join(', ')}).`,
  route: (dstIp: string, row: string | null, via: string | null) =>
    row
      ? via
        ? `Route lookup for ${dstIp}: matches ${row}, next hop is ${via}.`
        : `Route lookup for ${dstIp}: matches ${row}, which is directly connected.`
      : `Route lookup for ${dstIp}: no matching route.`,
  rewrite: (device: string, field: 'srcMac' | 'dstMac', from: string, to: string) =>
    `${device} replaces the ${field === 'srcMac' ? 'source' : 'destination'} MAC ${from} with ${to}. The IP addresses stay the same.`,
  natOut: (device: string, ip: string, port: number, pubIp: string, pubPort: number, created: boolean) =>
    `${device} replaces the private source ${ip}:${port} with its own public address ${pubIp}:${pubPort}. ${
      created
        ? 'It writes this in its NAT table, so it can recognise the reply.'
        : 'This conversation is already in its NAT table.'
    }`,
  natForwardOut: (device: string, ip: string, port: number, pubIp: string, pubPort: number) =>
    `${device} replies from public ${pubIp}:${pubPort}: a port forwarding rule says ${ip}:${port} lives there.`,
  natIn: (device: string, pubPort: number, ip: string, port: number) =>
    `${device} looks up public port ${pubPort} in its NAT table: that is ${ip}:${port} inside. It puts those back as the destination.`,
  natForwardIn: (device: string, pubPort: number, ip: string, port: number) =>
    `${device} has a port forwarding rule: public port ${pubPort} always goes to ${ip}:${port}.`,
  resolved: (device: string, name: string, ip: string) =>
    `${device} now knows that ${name} is ${ip}, and sends the real message there.`,
  dnsLookup: (name: string, ip: string | null) =>
    ip ? `The DNS server looks up "${name}" in its list of names: ${ip}.` : `The DNS server looks up "${name}" in its list of names: not there.`,
  dhcpPick: (mac: string, ip: string, known: boolean) =>
    known
      ? `The DHCP server has seen ${mac} before and offers the same address again: ${ip}.`
      : `The DHCP server picks a free address from its pool for ${mac}: ${ip}.`,
  configure: (device: string, ip: string, prefix: number, gateway?: string, dns?: string) =>
    `${device} configures itself: IP address ${ip}/${prefix}${gateway ? `, default gateway ${gateway}` : ''}${dns ? `, DNS server ${dns}` : ''}.`,
  deliver: (device: string, app: string, port: number) =>
    `The message arrives at the ${app} application on ${device}, which opened port ${port}.`,
  dropped: (device: string, reason: DropReason) => `${device}: ${DROP_TEXT[reason].title}. ${DROP_TEXT[reason].text}`,
};
