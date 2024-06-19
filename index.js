const fs = require('fs');
const fetch = require('node-fetch');
const ora = require('ora');
const colors = require('colors');
const MAX_RETRIES = 3;

// Function to load Sybil addresses from the CSV file
function loadSybilList(filePath) {
    return new Promise((resolve, reject) => {
        const sybilSet = new Set();
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                const rows = data.split('\n');
                rows.forEach(row => {
                    const columns = row.split(',');
                    const address = columns[columns.length - 1].trim();
                    if (address) {
                        sybilSet.add(address.toLowerCase());
                    }
                });
                resolve(sybilSet);
            }
        });
    });
}

// Function to load wallet addresses from a text file
function loadWalletAddresses(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                const walletAddresses = data.split('\n').map(line => line.trim());
                resolve(walletAddresses);
            }
        });
    });
}

// Function to check eligibility via API
async function checkEligibility(address, spinner) {
    const url = `https://zkcodex-api.vercel.app/api/layerzero/${address}`;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en-US,en;q=0.9,tr;q=0.8',
                    'cache-control': 'no-cache',
                    'dnt': '1',
                    'origin': 'https://zkcodex.com',
                    'pragma': 'no-cache',
                    'priority': 'u=1, I',
                    'referer': 'https://zkcodex.com/',
                    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Microsoft Edge";v="126"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'cross-site',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
                }
            });
            if (response.status === 500) {
                throw new Error('Server error, retrying...');
            }
            return await response.json();
        } catch (error) {
            if (attempt === MAX_RETRIES) {
                throw error;
            }
            spinner.text = `Checking address ${address} (Retry ${attempt}/${MAX_RETRIES})`;
        }
    }
}

// Function to append eligible addresses to a file
function appendEligibleAddress(filePath, address, amount) {
    const data = `${address},${amount}\n`;
    fs.appendFile(filePath, data, (err) => {
        if (err) {
            console.error(colors.red('Error writing to file:'), err);
        }
    });
}

// Function to check eligibility and sybil status
async function checkAirdropAndSybilStatus(walletAddressesFilePath, sybilFilePath) {
    try {
        const walletAddresses = await loadWalletAddresses(walletAddressesFilePath);
        const sybilSet = await loadSybilList(sybilFilePath);
        let totalAllocation = 0;

        for (const address of walletAddresses) {
            const spinner = ora(`Checking address ${address}`).start();
            try {
                const lowerAddress = address.toLowerCase();
                if (sybilSet.has(lowerAddress)) {
                    spinner.fail(colors.red(`${address} is marked as sybil and is not eligible.`));
                    continue;
                }

                const eligibility = await checkEligibility(lowerAddress, spinner);
                if (eligibility.isEligible) {
                    const amount = parseFloat(eligibility.zroAllocation.asString);
                    totalAllocation += amount;
                    spinner.succeed(colors.green(`${address} is eligible with an allocation of ${amount} ZRO.`));
                    appendEligibleAddress('eligible_addresses.txt', address, amount);
                } else {
                    spinner.info(colors.yellow(`${address} is not eligible for the airdrop.`));
                }
            } catch (error) {
                spinner.fail(colors.yellow(`${address} is not eligible for the airdrop.`));
            }
        }

        console.log(colors.green(`Total Allocation: ${totalAllocation.toFixed(2)} ZRO`));
    } catch (error) {
        console.error(colors.red('Error:'), error);
    }
}

// Paths to your files
const walletAddressesFilePath = 'wallets.txt';
const sybilFilePath = 'provisionalSybilList3.0.csv';

// Check airdrop and sybil status
checkAirdropAndSybilStatus(walletAddressesFilePath, sybilFilePath);