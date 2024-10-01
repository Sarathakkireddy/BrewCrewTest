const net = require('net');
const fs = require('fs');

const client = new net.Socket();
client.connect(3000, 'localhost', () => {
    console.log('Connected to the BetaCrew Exchange Server');
    client.write(Buffer.from([1,0]));
});

let receivedPackets = [];
let missingSequences = [];

client.on('data', (data) => {
    console.log('Received data from server');
    let index = 0;
    
    while (index < data.length) {
        let symbol = data.slice(index, index + 4).toString('ascii');
        let buySell = data.slice(index + 4, index + 5).toString('ascii');
        let quantity = data.readInt32BE(index + 5);
        let price = data.readInt32BE(index + 9);
        let sequence = data.readInt32BE(index + 13);

        receivedPackets.push({ symbol, buySell, quantity, price, sequence });
        index += 17;
    }
});

client.on('close', () => {
    console.log('Connection closed, checking for missing sequences...');
    
    let expectedSeq = 1;
    for (let i = 0; i < receivedPackets.length; i++) {
        if (receivedPackets[i].sequence !== expectedSeq) {
            missingSequences.push(expectedSeq);
            if(expectedSeq+1===receivedPackets[i].sequence){
            expectedSeq = receivedPackets[i].sequence;
            }else{
                i--;
            }
        }
        expectedSeq++;
    }
    if (missingSequences.length > 0) {
        console.log(`Missing sequences found: ${missingSequences}`);
        resendMissingPackets();
    } else {
        console.log('No missing sequences. Saving data to file.');
        saveToFile(receivedPackets);
    }
});

function resendMissingPackets() {
    missingSequences.forEach((seq, index) => {
        const resendClient = new net.Socket();
        
        resendClient.connect(3000, 'localhost', () => {
            console.log(`Requesting missing packet with sequence: ${seq}`);
            resendClient.write(Buffer.from([2, seq]));
        });

        resendClient.on('data', (data) => {
            console.log(`Received missing packet with sequence: ${seq}`);
            let symbol = data.slice(0, 4).toString('ascii');
            let buySell = data.slice(4, 5).toString('ascii');
            let quantity = data.readInt32BE(5);
            let price = data.readInt32BE(9);
            let sequence = data.readInt32BE(13);

            receivedPackets.push({ symbol, buySell, quantity, price, sequence });

            resendClient.destroy();

            if (index === missingSequences.length - 1) {
                saveToFile(receivedPackets);
            }
        });

        resendClient.on('error', (err) => {
            console.error('Error during resend:', err);
        });

        resendClient.on('close', () => {
            console.log(`Resend connection closed for sequence: ${seq}`);
        });
    });
}
function saveToFile(packets) {
    
    packets.sort((a, b) => a.sequence - b.sequence);
    fs.writeFileSync('output.json', JSON.stringify(packets, null, 2));
    console.log('Data saved to stock_data.json');
}


client.on('error', (err) => {
    console.error('Error: ', err);
});
