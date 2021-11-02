// Arweave and Ethereum signing utilities.
import Arweave from 'arweave';
import { ethers } from "ethers";

function init() {
  return Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https',
    timeout: 20000,
    logging: false,
  });
}

const arweave = init();

const ADMIN_ACCT = "aek33fcNH1qbb-SsDEqBF1KDWb8R1mxX6u4QGoo3tAs";
const DOC_TYPE = "interdependence_doc_type";
const DOC_ORIGIN = "interdependence_doc_origin";
const DOC_REF = "interdependence_doc_ref";
const SIG_NAME = "interdependence_sig_name";
const SIG_HANDLE = "interdependence_sig_handle";
const SIG_ADDR = "interdependence_sig_addr";
const SIG_ISVERIFIED = "interdependence_sig_verified";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8080";

export async function forkDeclaration(oldTxId, newText, authors) {
  const formData = new URLSearchParams({
    authors: JSON.stringify(authors),
    newText,
  });

  return fetch(`${SERVER_URL}/fork/${oldTxId}`, {
    method: 'post',
    body: formData,
  }).then(data => data.json());
}

export async function signDeclaration(txId, name, userProvidedHandle, declaration) {
  if (!window.ethereum) {
    throw new Error("No wallet found. Please install Metamask or another Web3 wallet provider.");
  }

  // Sign the declarataion. Any errors here should be handled by the caller.
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const signature = await signer.signMessage(declaration);
  const address = await signer.getAddress();

  const formData = new URLSearchParams({
    name,
    address,
    signature,
    handle: userProvidedHandle,
  });

  await fetch(`${SERVER_URL}/sign/${txId}`, {
    method: 'post',
    body: formData,
  }).then(data => data.json()).catch((err) => {
    alert("Could not reach signing server");
    throw err;
  });
}

export async function verifyTwitter(address, handle) {
  const formData = new URLSearchParams({
    address,
  });

  return fetch(`${SERVER_URL}/verify/${handle}`, {
    method: 'post',
    body: formData,
  }).then(data => data.json());
}

async function fetchSignatures(txId) {
  const req = await fetch('https://arweave.net/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query: `
      query {
        transactions(
          tags: [
            {
              name: "${DOC_TYPE}",
              values: ["signature"]
            },
            {
              name: "${DOC_REF}",
              values: ["${txId}"]
            }
          ],
          owners: ["${ADMIN_ACCT}"]
        ) {
          edges {
            node {
              id
              tags {
                name
                value
              }
            }
          }
        }
      }
      `
    })
  });

  const json = await req.json();

  const unique_tx = new Set();
  return json.data.transactions.edges.flatMap(nodeItem => {
    const n = nodeItem.node;
    const sig = n.tags.find(tag => tag.name === SIG_ADDR).value;
    const handle = n.tags.find(tag => tag.name === SIG_HANDLE).value;

    if (unique_tx.has(sig)) {
      return [];
    }

    unique_tx.add(sig);
    return [{
      SIG_ID: n.id,
      SIG_ADDR: sig,
      SIG_NAME: n.tags.find(tag => tag.name === SIG_NAME).value,
      SIG_HANDLE: handle === 'null' ? 'UNSIGNED' : handle,
      SIG_ISVERIFIED: n.tags.find(tag => tag.name === SIG_ISVERIFIED).value === 'true',
    }];
  });
}

export async function getDeclaration(txId) {
  const res = {
    txId,
    data: {},
    sigs: [],
    status: 404,
  };
  const txStatus = await arweave.transactions.getStatus(txId);
  if (txStatus.status !== 200) {
    res.status = txStatus.status;
    return res;
  }

  const transactionMetadata = await arweave.transactions.get(txId);
  const tags = transactionMetadata.get('tags').reduce((prev, tag) => {
    let key = tag.get('name', {decode: true, string: true});
    prev[key] = tag.get('value', {decode: true, string: true});
    return prev;
  }, {});

  // ensure correct type, return undefined otherwise
  if (!(DOC_TYPE in tags) || tags[DOC_TYPE] !== 'declaration') {
    return res;
  }

  // otherwise metadata seems correct, go ahead and fetch
  const blockId = txStatus.confirmed.block_indep_hash;
  const blockMeta = await arweave.blocks.get(blockId);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  const time = new Date(blockMeta.timestamp * 1000);
  res.data = {
    ...JSON.parse(await arweave.transactions.getData(txId, {
      decode: true,
      string: true,
    })),
    timestamp: time.toLocaleDateString('en-US', options),
  };

  // fetch associated signatures
  res.sigs = await fetchSignatures(txId);
  res.status = 200;
  return res;
}
