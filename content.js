let debug = getExtensionSettings().debug || false;
let importButton;
let update;
const originalLog = console.log;

console.log = function(...args) {
    if (debug) {
        originalLog.apply(console, args);
    }
};

async function initializeSearchButton() {
    // Prüfen, ob die Suchleiste und ihre Container vorhanden sind
    if (elements.div_searchLeft && elements.div_searchRight) {
        const style = document.createElement('style');
        style.textContent = `
            .search-left {
                width: 42% !IMPORTANT;
            }
            #custom-button-container {
                float: left !IMPORTANT;
            }
            #custom-button-container button:disabled {
                background-color: #cccccc !IMPORTANT;
                color: #7a7a7a !IMPORTANT;
                cursor: not-allowed !IMPORTANT;
                border: 1px solid #999999 !IMPORTANT;
            }
        `;
        document.head.appendChild(style);

        if (!document.getElementById('custom-button-container')) {
            const buttonContainer = document.createElement('div');
            buttonContainer.id = 'custom-button-container';
            buttonContainer.style.display = 'flex';
            buttonContainer.style.alignItems = 'center';
            buttonContainer.style.margin = '0 10px';

            importButton = document.createElement('button');
            elements.importButton = importButton;
            importButton.textContent = 'Import from Clipboard';
            importButton.classList.add('import-button');

            // Eventlistener für den Import-Button
            importButton.addEventListener('click', async () => {
                showBlockingOverlay("Importing, please wait");
                console.log('Import button clicked!');
                const filterButtonText = elements.button_showFilters.textContent.trim();
                if (filterButtonText === "Show Filters") {
                    elements.button_showFilters.click();
                }

                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText) {
                    await fillFilterFields(clipboardText);
                    const settings = await getExtensionSettings();
                    if (settings.searchExtension === true) {
                          elements.button_search.click();
                          console.log('Seach Button got triggered!');
                    }
                }
                hideBlockingOverlay();
            });

            buttonContainer.appendChild(importButton);

            // Füge den Button-Container zur Suchleiste hinzu
            elements.div_searchRight.insertAdjacentElement('beforebegin', buttonContainer);

            console.log('Button-Container erfolgreich hinzugefügt!');
        }
    } else {
        console.error('Suchleiste oder Container nicht gefunden.');
    }
}

function setFilter(filterName, activate) {
    const filterTitle = Array.from(document.querySelectorAll('.filter-title'))
        .find(el => el.textContent.trim() === filterName);

    if (!filterTitle) {
        console.error(`Filter "${filterName}" nicht gefunden.`);
        return;
    }

    const toggleButton = filterTitle.closest('.filter-group-header')?.querySelector('.btn.toggle-btn');

    if (!toggleButton) {
        console.error(`Toggle-Button for "${filterName}" not found.`);
        return;
    }

    const filterGroupBody = filterTitle.closest('.filter-group').querySelector('.filter-group-body');
    const isActive = filterGroupBody?.style.display !== 'none';

    if (activate && !isActive) {
        toggleButton.click();
        console.log(`Filter "${filterName}" is checked.`);
    } else if (!activate && isActive) {
        toggleButton.click();
        console.log(`Filter "${filterName}" is unchecked.`);
    } else {
        console.log(`Filter "${filterName}" is already checked!`);
    }
}

function mapDropdownValue(str) {
    for (const [dropdownText, gameTexts] of Object.entries(itemCategory)) {
        if (gameTexts.includes(str)) {
            return dropdownText;
        }
    }
    console.warn(`No dropdown mapping found for: "${str}". Using original.`);
    return 'Any';
}

function selectDropdownOption(dropdown, str, map) {
    if (!dropdown) return;

    let dropdownText;
    if (map) {
        dropdownText = mapDropdownValue(str);
    } else {
        dropdownText = str;
    }

    const dropdownWrapper = dropdown.closest('.multiselect__content-wrapper');
    if (dropdownWrapper) {
        dropdownWrapper.style.display = 'block';
    }

    const options = dropdown.querySelectorAll('.multiselect__element span.multiselect__option');
    let matchedOption = false;

    options.forEach(option => {
        if (option.textContent.trim() === dropdownText) {
            matchedOption = true;
            option.click();
            console.log(`Option "${dropdownText}" got clicked.`);
        }
    });

    if (!matchedOption) {
        console.warn(`Option "${dropdownText}" not found.`);
    }

    if (dropdownWrapper) {
        setTimeout(() => {
            dropdownWrapper.style.display = 'none';
        }, 200);
    }
}

async function clearAllStatFilters() {
    const statFilters = document.querySelectorAll('.filter-group-body .filter');
    if (statFilters.length > 0) {
        for (const filter of statFilters) {
            const titleElement = filter.querySelector('.filter-title-clickable span');
            const filterTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Filter';

            const removeButton = filter.querySelector('.btn.remove-btn');
            if (removeButton) {
                console.log(`Removing stat filter: "${filterTitle}"`);
                removeButton.click();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } else {
        console.log('No stat filters to remove.');
    }
}

async function fillFilterFields(text) {
    const settings = getExtensionSettings();

    for (const [standardTerm, alternatives] of Object.entries(mapChatItems)) {
        for (const alternative of alternatives) {
            // Escape Sonderzeichen in der Alternative
            const escapedAlternative = alternative.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

            // RegEx, der nur Begriffe innerhalb eckiger Klammern exakt matched
            const regex = new RegExp(`\\[${escapedAlternative}\\]`, 'gi');

            text = text.replace(regex, (match) => {
                // Debugging-Ausgabe
                console.log(`Aktueller Match-Versuch: "${match}" gegen "[${alternative}]"`);

                // Nur ersetzen, wenn der gesamte Begriff innerhalb von eckigen Klammern passt
                if (match === `[${alternative}]`) {
                    return standardTerm; // Klammern werden hier entfernt
                }

                // Rückgabe des Originals, falls keine Bedingung erfüllt ist
                return match;
            });
        }
    }

    console.log(`Normalisierter Text:\n${text}`);

    let lines = text.split('\n').map(line => line.trim());
    let remainingLines = [...lines];

    let activateTypeFilters = false;
    let activateEquipmentFilters = false;
    let activateRequirements = false;
    let activateWaystoneFilters = false;
    let activateMiscellaneous = false;
    let activateTradeFilters = false;

    await clearAllStatFilters();

    function removeProcessedLine(lineToRemove) {
        const index = remainingLines.indexOf(lineToRemove);
        if (index > -1) {
            remainingLines.splice(index, 1);
        }
    }

    if (settings.typeFilters.includes('Item Category')) {
        const itemClassLine = lines.find(line => line.startsWith('Item Class:'));
        if (itemClassLine) {
            const itemClass = itemClassLine.split(': ')[1];
            console.log(`Item Class: ${itemClass}`);
            setDropdownValue('Item Category', itemClass, true);
            activateTypeFilters = true;
            removeProcessedLine(itemClassLine);
        } else {
            setDropdownValue('Item Category', 'Any');
        }
    } else {
        setDropdownValue('Item Category', 'Any');
    }

    if (settings.typeFilters.includes('Item Rarity')) {
        const itemRarityLine = lines.find(line => line.startsWith('Rarity:'));
        if (itemRarityLine) {
            const itemRarity = itemRarityLine.split(': ')[1];
            console.log(`Rarity: ${itemRarity}`);
            setDropdownValue('Item Rarity', itemRarity);
            activateTypeFilters = true;
            removeProcessedLine(itemRarityLine);
        } else {
            setDropdownValue('Item Rarity', 'Any');
        }
    } else {
        setDropdownValue('Item Rarity', 'Any');
    }

    const itemLevelLine = lines.find(line => line.startsWith('Item Level:'));
    if (itemLevelLine && settings.typeFilters.includes('Item Level')) {
        const itemLevel = itemLevelLine.split(': ')[1];
        console.log(`Item Level: ${itemLevel}`);

        if (settings['toggle-item-level'] === 'min') {
            setMinMaxValues('Item Level', itemLevel, '');
        } else if (settings['toggle-item-level'] === 'minmax') {
            setMinMaxValues('Item Level', itemLevel, itemLevel);
        } else if (settings['toggle-item-level'] === 'max') {
            setMinMaxValues('Item Level', '', itemLevel);
        }

        activateTypeFilters = true;
        removeProcessedLine(itemLevelLine);
    } else {
        await clearMinMaxValues('Item Level');
    }

    const itemQualityLine = lines.find(line => line.startsWith('Quality:'));
    if (itemQualityLine && settings.typeFilters.includes('Item Quality')) {
        const itemQuality = cleanValue(itemQualityLine.split(': ')[1]);
        console.log(`Item Quality: ${itemQuality}`);

        if (settings['toggle-item-quality'] === 'min') {
            setMinMaxValues('Item Quality', itemQuality, '');
        } else if (settings['toggle-item-quality'] === 'minmax') {
            setMinMaxValues('Item Quality', itemQuality, itemQuality);
        } else if (settings['toggle-item-quality'] === 'max') {
            setMinMaxValues('Item Quality', '', itemQuality);
        }

        activateTypeFilters = true;
        removeProcessedLine(itemQualityLine);
    } else {
        await clearMinMaxValues('Item Quality');
    }

    if (activateTypeFilters) {
        setFilter('Type Filters', true);
        console.log('Type Filters activated.');
    }

    /*
    // TODO - calculating this is really uff...
    const equipmentArmourLine = lines.find(line => line.startsWith('Armour:'));
    if (equipmentArmourLine) { // && settings.equipmentFilters.includes('Armour')
        const equipmentArmour = cleanValue(equipmentArmourLine.split(': ')[1]);
        console.log(`Armour: ${equipmentArmour}`);

        setMinMaxValues('Armour', equipmentArmour, equipmentArmour);
        if (settings['toggle-equipment-armour'] === 'min') {
            setMinMaxValues('Equipment Filters', equipmentArmour, '');
        } else if (settings['toggle-equipment-armour'] === 'minmax') {
            setMinMaxValues('Equipment Filters', equipmentArmour, equipmentArmour);
        } else if (settings['toggle-equipment-armour'] === 'max') {
            setMinMaxValues('Equipment Filters', '', equipmentArmour);
        }

        activateEquipmentFilters = true;
        removeProcessedLine(equipmentArmourLine);
    } else {
        await clearMinMaxValues('Armour');
    }
    */

    const equipmentBlockLine = lines.find(line => line.startsWith('Block chance:'));
    if (equipmentBlockLine && settings.equipmentFilters.includes('Block')) {
        const equipmentBlock = cleanValue(equipmentBlockLine.split(': ')[1]);
        console.log(`Block: ${equipmentBlock}`);

        if (settings['toggle-equipment-block'] === 'min') {
            setMinMaxValues('Block', equipmentBlock, '');
        } else if (settings['toggle-equipment-block'] === 'minmax') {
            setMinMaxValues('Block', equipmentBlock, equipmentBlock);
        } else if (settings['toggle-equipment-block'] === 'max') {
            setMinMaxValues('Block', '', equipmentBlock);
        }

        activateEquipmentFilters = true;
        removeProcessedLine(equipmentBlockLine);
    } else {
        await clearMinMaxValues('Block');
    }

    if (activateEquipmentFilters) {
        await clearMinMaxValues('Damage');
        await clearMinMaxValues('Attacks per Second');
        await clearMinMaxValues('Critical Chance');
        await clearMinMaxValues('Damage per Second');
        await clearMinMaxValues('Physical DPS');
        await clearMinMaxValues('Elemental DPS');
        await clearMinMaxValues('Armour');
        await clearMinMaxValues('Evasion');
        await clearMinMaxValues('Energy Shield');
        await clearMinMaxValues('Spirit');
        await clearMinMaxValues('Empty Rune Sockets');

        setFilter('Equipment Filters', true);
        console.log('Equipment Filters activated.');
    } else {
        setFilter('Equipment Filters', false);
        console.log('Equipment Filters deactivated.');
    }

    const levelLine = lines.find(line => line.startsWith('Level:'));
    if (levelLine && settings.requirements.includes('Level')) {
        const level = cleanValue(levelLine.split(': ')[1]);
        console.log(`Level: ${level}`);

        if (settings['toggle-requirements-level'] === 'min') {
            setMinMaxValues('Level', level, '');
        } else if (settings['toggle-requirements-level'] === 'minmax') {
            setMinMaxValues('Level', level, level);
        } else if (settings['toggle-requirements-level'] === 'max') {
            setMinMaxValues('Level', '', level);
        }

        activateRequirements = true;
        removeProcessedLine(levelLine);
    } else {
        await clearMinMaxValues('Level');
    }

    const strLine = lines.find(line => line.startsWith('Str:'));
    if (strLine && settings.requirements.includes('Strength')) {
        const str = cleanValue(strLine.split(': ')[1]);
        console.log(`Strength: ${str}`);

        if (settings['toggle-requirements-str'] === 'min') {
            setMinMaxValues('Strength', str, '');
        } else if (settings['toggle-requirements-str'] === 'minmax') {
            setMinMaxValues('Strength', str, str);
        } else if (settings['toggle-requirements-str'] === 'max') {
            setMinMaxValues('Strength', '', str);
        }

        activateRequirements = true;
        removeProcessedLine(strLine);
    } else {
        await clearMinMaxValues('Strength');
    }

    const dexLine = lines.find(line => line.startsWith('Dex:'));
    if (dexLine && settings.requirements.includes('Dexterity')) {
        const dex = cleanValue(dexLine.split(': ')[1]);
        console.log(`Dexterity: ${dex}`);

        if (settings['toggle-requirements-dex'] === 'min') {
            setMinMaxValues('Dexterity', dex, '');
        } else if (settings['toggle-requirements-dex'] === 'minmax') {
            setMinMaxValues('Dexterity', dex, dex);
        } else if (settings['toggle-requirements-dex'] === 'max') {
            setMinMaxValues('Dexterity', '', dex);
        }

        activateRequirements = true;
        removeProcessedLine(dexLine);
    } else {
        await clearMinMaxValues('Dexterity');
    }

    const intLine = lines.find(line => line.startsWith('Int:'));
    if (intLine && settings.requirements.includes('Intelligence')) {
        const int = cleanValue(intLine.split(': ')[1]);
        console.log(`Intelligence: ${int}`);

        if (settings['toggle-requirements-int'] === 'min') {
            setMinMaxValues('Intelligence', int, '');
        } else if (settings['toggle-requirements-int'] === 'minmax') {
            setMinMaxValues('Intelligence', int, int);
        } else if (settings['toggle-requirements-int'] === 'max') {
            setMinMaxValues('Intelligence', '', int);
        }

        activateRequirements = true;
        removeProcessedLine(intLine);
    } else {
        await clearMinMaxValues('Intelligence');
    }

    if (activateRequirements) {
        setFilter('Requirements', true);
        console.log('Requirements activated.');
    } else {
        setFilter('Requirements', false);
        console.log('Requirements deactivated.');
    }

    // await clearMinMaxValues('Waystone Tier');
    // await clearMinMaxValues('Waystone Drop Chance');
    setFilter('Waystone Filters', false);

    // await clearMinMaxValues('Gem Level');
    // await clearMinMaxValues('Gem Sockets');
    // await clearMinMaxValues('Area Level');
    // await clearMinMaxValues('Stack Size');
    // setDropdownValue('Identified', 'Any');
    // setDropdownValue('Corrupted', 'Any');
    // setDropdownValue('Mirrored', 'Any');
    // setDropdownValue('Alternate Art', 'Any');
    // await clearMinMaxValues('Barya Sacred Water');
    // await clearMinMaxValues('Unidentified Tier');
    setFilter('Miscellaneous', false);

    const filterGroup = Array.from(document.querySelectorAll('.filter-title')).find(el => el.textContent.trim() === 'Seller Account');
    if (!filterGroup) {
        console.warn('Filter "${filterTitle}" nicht gefunden.');
        return;
    }

    const filterContainer = filterGroup.closest('.filter-body');
    const sellerAccount = filterContainer?.querySelector('input[placeholder="Enter account name..."]');

    if (settings.autoSeller === true) {
        setInputValue(sellerAccount, settings.sellerAccount);
        activateTradeFilters = true;
    } else {
        setInputValue(sellerAccount, '');
    }

    if (activateTradeFilters) {
        setInputValue('Collapse Listings by Account', 'No');
        setDropdownValue('Collapse Listings by Account', 'No');
        setDropdownValue('Listed', 'Any Time');
        setDropdownValue('Sale Type', 'Buyout or Fixed Price');
        setDropdownValue('Buyout Price', 'Relative');
        await clearMinMaxValues('Buyout Price');

        setFilter('Trade Filters', true);
    } else {
        setFilter('Trade Filters', false);
    }

    const statLines = remainingLines.filter(line =>
        matchStatWithKnownModifiers(line)
    );

    if (statLines.length > 0) {
        console.log('Processing stats:', statLines);

        const itemClassLine = lines.find(line => line.startsWith('Item Class:'));

        if (itemClassLine) {
            const itemClass = itemClassLine.split(': ')[1];
            await processStatLines(statLines, mapDropdownValue(itemClass));
            statLines.forEach(removeProcessedLine);
        }
    }

    console.log(`Remaining lines:\n${remainingLines.join('\n')}`);
}

async function clearMinMaxValues(filterTitle) {
    const filterGroup = findFilterGroupByTitle(filterTitle);
    if (filterGroup) {
        const minInput = filterGroup.querySelector('input[placeholder="min"]');
        const maxInput = filterGroup.querySelector('input[placeholder="max"]');

        if (minInput) {
            await setInputValue(minInput, '');
        } else {
            console.warn(`Min-Input for "${filterTitle}" not.`);
        }

        if (maxInput) {
            await setInputValue(maxInput, '');
        } else {
            console.warn(`Max-Input for "${filterTitle}" not found.`);
        }

        console.log(`Cleared min/max values for "${filterTitle}".`);
    } else {
        console.warn(`Filter "${filterTitle}" not found!`);
    }
}

let itemCategory;
let modifiers;
let mapChatItems;

// Funktion zum Laden der JSON-Datei
async function loadJSON(filePath) {
    try {
        const response = await fetch(chrome.runtime.getURL(filePath));
        if (!response.ok) {
            throw new Error(`Failed to load JSON file: ${filePath} (status: ${response.status})`);
        }
        const data = await response.json();
        console.log(`File loaded from ${filePath}`);
        return data;
    } catch (error) {
        console.error(`Error loading file JSON: ${error.message}`);
        return null;
    }
}

// Funktion zum Laden aus localStorage oder Standard-JSON-Datei
async function loadFromStorageOrDefault(fileName, filePath) {
    const storedContent = localStorage.getItem(fileName);
    if (storedContent) {
        console.log(`${fileName} loaded from localStorage.`);
        return JSON.parse(storedContent); // Parse gespeicherte Inhalte
    } else {
        console.log(`${fileName} not found in localStorage. Loading default.`);
        return await loadJSON(filePath); // Fallback auf lokale Datei
    }
}

// Initialisierung der Modifiers
async function initializeModifiers() {
    const data = await loadFromStorageOrDefault("modifiers.json", "modifiers.json");
    if (data) {
        console.log("Modifiers initialized");
        return data;
    } else {
        throw new Error("Failed to initialize modifiers");
    }
}

// Initialisierung der itemCategory
async function initializeItemCategory() {
    const data = await loadFromStorageOrDefault("itemCategory.json", "itemCategory.json");
    if (data) {
        console.log("itemCategory initialized");
        return data;
    } else {
        throw new Error("Failed to initialize itemCategory");
    }
}

// Initialisierung der mapChatItems
async function initializeMapChatItems() {
    const data = await loadFromStorageOrDefault("mapChatItems.json", "mapChatItems.json");
    if (data) {
        console.log("mapChatItems initialized");
        return data;
    } else {
        throw new Error("Failed to initialize mapChatItems");
    }
}

// Haupt-Initialisierungsfunktion
(async () => {
    try {
        modifiers = await initializeModifiers();
        itemCategory = await initializeItemCategory();
        mapChatItems = await initializeMapChatItems();
        console.log("Files are ready to use.");

        initializeApp(); // Starte den Rest des Codes
    } catch (error) {
        console.error("Initialization failed:", error.message);
    }
})();


/*
  Tablet:
  not founded at all -> Your Maps have #% chance to contain an Essence 
*/

function matchStatWithKnownModifiers(stat) {
    const normalizedStat = Object.keys(modifiers).find(key => {
        const modifier = modifiers[key];
        if (modifier.replace) {
            const selectivelyNormalized = selectivelyNormalizeStat(stat, modifier.replace);
            console.log(`Selective Normalization: "${stat}" -> "${selectivelyNormalized}"`);
            return selectivelyNormalized === key;
        } else {
            const defaultNormalized = stat.replace(/[-+]?\d+\.?\d*/g, "#").trim();
            console.log(`Default Normalization: "${stat}" -> "${defaultNormalized}"`);
            return defaultNormalized === key;
        }
    });

    return normalizedStat || null;
}

function selectivelyNormalizeStat(stat, replaceIndices = []) {
    let index = 0; // Zähler für gefundene Zahlen
    return stat.replace(/[-+]?\d+\.?\d*/g, (match) => {
        index++;
        return replaceIndices.includes(index) ? "#" : match;
    });
}

async function processStatLines(statLines, itemType) {
    for (const stat of statLines) {
        const normalizedStat = stat.replace(/[-+]?\d+\.?\d*/g, "#").trim();
        const modifier = matchStatWithKnownModifiers(stat);

        if (modifier) {
            const {
                mapped = modifier,
                    optionIndex,
                    additional,
                    additionalByItem,
                    triggerAbove,
                    adjustValue
            } = modifiers[modifier];

            console.log(`Processing stat: "${stat}" -> "${mapped}"`);

            let minValue = null,
                maxValue = null;

            const numericValues = stat.match(/[-+]?\d*\.?\d+/g);
            if (numericValues) {
                minValue = parseFloat(numericValues[0].replace(/^\+/, ""));
                maxValue = numericValues.length > 1 ? parseFloat(numericValues[1].replace(/^\+/, "")) : minValue;

                if (triggerAbove !== undefined && minValue <= triggerAbove) {
                    console.log(`Skipping stat "${stat}" as its value does not meet the triggerAbove condition.`);
                    return;
                }

                if (adjustValue !== undefined) {
                    minValue += adjustValue;
                    maxValue += adjustValue;
                }

                if (stat.includes("reduced") && mapped.includes("increased")) {
                    minValue = `-${Math.abs(minValue)}`;
                }

                if (stat.includes("increased") && mapped.includes("reduced")) {
                    minValue = `-${Math.abs(minValue)}`;
                }
            }

            let resolvedAdditional = additional || null;
            if (additionalByItem) {
                resolvedAdditional = additionalByItem[itemType] || resolvedAdditional;
            }

            let _optionIndex = 1; // Default
            if (optionIndex) {
                if (typeof optionIndex === "object") {
                    _optionIndex = optionIndex[itemType] || optionIndex["default"] || 1;
                } else {
                    _optionIndex = optionIndex;
                }
            }

            const dropdownWrapper = document.querySelector('.multiselect.filter-select.filter-select-mutate');
            if (!dropdownWrapper) {
                console.error('Stat Filter dropdown not found.');
                return;
            }

            const addStatInput = dropdownWrapper.querySelector('.multiselect__input[placeholder="+ Add Stat Filter"]');
            if (!addStatInput) {
                console.error('Stat Filter input field not found.');
                return;
            }

            addStatInput.value = mapped;
            const inputEvent = new Event('input', { bubbles: true });
            addStatInput.dispatchEvent(inputEvent);

            await waitForCondition(() => {
                return document.querySelectorAll('.multiselect__content .multiselect__option').length > 0;
            }, 50, 2000);

            const options = Array.from(dropdownWrapper.querySelectorAll('.multiselect__content .multiselect__option'));

            let matchedOptions = options.filter(option => {
                const optionText = option.querySelector('span').textContent.trim();
                const additionalText = option.querySelector('i')?.textContent.trim();
                return optionText === mapped && (!resolvedAdditional || additionalText === resolvedAdditional);
            });

            let matchedOption = null;
            if (_optionIndex && matchedOptions.length >= _optionIndex) {
                matchedOption = matchedOptions[_optionIndex - 1];
            } else if (matchedOptions.length > 0) {
                matchedOption = matchedOptions[0];
            }

            if (matchedOption) {
                matchedOption.click();
                console.log(`Selected option: "${mapped}" (additional: ${resolvedAdditional || "none"})`);

                const parentFilter = await waitForNewestStatElement(mapped, resolvedAdditional);

                if (parentFilter) {
                    const minInput = parentFilter.querySelector('input[placeholder="min"]');
                    const maxInput = parentFilter.querySelector('input[placeholder="max"]');

                    const settings = getExtensionSettings();
                    if (minInput && minValue !== null && ['min', 'minmax'].includes(settings['toggle-stat-default'])) {
                        await setInputValue(minInput, minValue);
                    }

                    if (maxInput && maxValue !== null && ['max', 'minmax'].includes(settings['toggle-stat-default'])) {
                        await setInputValue(maxInput, maxValue);
                    }

                    console.log(`Set min: ${minValue}, max: ${maxValue} for "${mapped}"`);
                } else {
                    console.warn(`Could not find input fields for: "${mapped}"`);
                }
            } else {
                console.warn(`No matching option found for: "${mapped}"`);
            }
        } else {
            console.log(`Unknown stat: "${stat}" - Skipping.`);
        }
    }
}

async function waitForCondition(conditionFn, interval = 10, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const intervalId = setInterval(() => {
            try {
                if (conditionFn()) {
                    clearInterval(intervalId);
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(intervalId);
                    reject(new Error('Timeout waiting for condition.'));
                }
            } catch (error) {
                clearInterval(intervalId);
                reject(error);
            }
        }, interval);
    });
}

async function waitForNewestStatElement(mappedStat, additional) {
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
            const filters = Array.from(document.querySelectorAll('.filter'))
                .filter(filter => {
                    const titleSpan = filter.querySelector('.filter-title-clickable span');
                    const additionalType = filter.querySelector('.filter-title-clickable i')?.textContent.trim();
                    return (
                        titleSpan &&
                        titleSpan.textContent.trim() === mappedStat &&
                        (!additional || additionalType === additional)
                    );
                });

            // Nimm den letzten gefundenen Filter
            const newestFilter = filters[filters.length - 1];

            if (newestFilter) {
                observer.disconnect();
                resolve(newestFilter);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout: Stat input for "${mappedStat}" with additional "${additional}" not found.`));
        }, 2000);
    });
}

function setDropdownValue(filterTitle, value, map=false) {
    const filterGroup = Array.from(document.querySelectorAll('.filter-title')).find(el => el.textContent.trim() === filterTitle);
    if (!filterGroup) {
        console.warn(`Filter "${filterTitle}" nicht gefunden.`);
        return;
    }

    const dropdown = filterGroup.parentNode.querySelector('.multiselect__content');
    if (dropdown) {
        selectDropdownOption(dropdown, value, map);
    }
}

function cleanValue(value) {
    if (!value) return null;

    value = value.replace(/\(augmented\)|\(unmet\)/g, '').trim();

    const match = value.match(/[-+]?\d*\.?\d+/);
    return match ? match[0].replace(/^\+/, '') : null;
}

async function setInputValue(inputElement, value) {
    if (inputElement) {
        inputElement.value = value || '';

        const inputEvent = new Event('input', { bubbles: true });
        inputElement.dispatchEvent(inputEvent);

        const changeEvent = new Event('change', { bubbles: true });
        inputElement.dispatchEvent(changeEvent);

        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

async function initializeExtensionSettingsButton() {
    const navTabs = document.querySelector('.nav.nav-tabs.account');
    if (!navTabs) {
        console.error('Navigation tabs not found.');
        return;
    }

    if (navTabs.querySelector('.menu-extension')) {
        console.log('Extension menu already exists.');
        return;
    }

    const newTab = document.createElement('li');
    newTab.setAttribute('role', 'presentation');
    newTab.className = 'menu-extension';

    const newTabLink = document.createElement('a');
    const newTabText = document.createElement('span');
    newTabText.textContent = 'Extension Settings';

    newTabLink.appendChild(newTabText);
    newTab.appendChild(newTabLink);
    navTabs.appendChild(newTab);

    newTab.style.float = 'right';
    newTab.style.height = '32px';

    loadSettingsModal();

    newTab.addEventListener('click', async () => {
        const modal = document.getElementById('extension-settings-modal');
        const overlay = document.getElementById('extension-settings-overlay');
        if (modal && overlay) {
            const isVisible = modal.style.display === 'block';
            modal.style.display = isVisible ? 'none' : 'block';
            overlay.style.display = isVisible ? 'none' : 'block';

            if (!update) {
              update = true;
              await initializeUpdate();
            }
        } else {
            console.error('Modal or overlay not found.');
        }
    });

    console.log('Extension menu added successfully with toggle functionality.');
}

function initializeExtensionFavoriteButton() {
    const navTabs = document.querySelector('.nav.nav-tabs.account');
    if (!navTabs) {
        console.error('Navigation tabs not found.');
        return;
    }

    if (navTabs.querySelector('.menu-favorite')) {
        console.log('Favorite menu already exists.');
        return;
    }

    const newTab = document.createElement('li');
    newTab.setAttribute('role', 'presentation');
    newTab.className = 'menu-favorite';

    const newTabLink = document.createElement('a');
    const newTabText = document.createElement('span');
    newTabText.textContent = 'Favorite';

    newTabLink.appendChild(newTabText);
    newTab.appendChild(newTabLink);
    navTabs.appendChild(newTab);

    newTab.style.float = 'right';
    newTab.style.height = '32px';

    // loadSettingsModal();

    newTab.addEventListener('click', () => {
        const modal = document.getElementById('favorite-modal');
        const overlay = document.getElementById('favorite-overlay');
        if (modal && overlay) {
            const isVisible = modal.style.display === 'block';
            modal.style.display = isVisible ? 'none' : 'block';
            overlay.style.display = isVisible ? 'none' : 'block';
        } else {
            console.error('Modal or overlay not found.');
        }
    });

    console.log('Favorite menu added successfully with toggle functionality.');
}

function showBlockingOverlay(message = "Processing") {
    // Überprüfen, ob das Overlay bereits existiert
    if (document.getElementById("blocking-overlay")) {
        return;
    }

    // Erstelle das Overlay
    const overlay = document.createElement("div");
    overlay.id = "blocking-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.color = "#fff";
    overlay.style.fontSize = "24px";
    overlay.style.fontFamily = "Arial, sans-serif";
    overlay.style.pointerEvents = "auto"; // Blockiert Klicks auf darunterliegende Inhalte
    overlay.style.userSelect = "none"; // Verhindert Textmarkierung

    // Erstelle die Nachricht
    const messageContainer = document.createElement("div");
    messageContainer.style.display = "flex";
    messageContainer.style.alignItems = "center";
    messageContainer.style.userSelect = "none"; // Verhindert Textmarkierung

    const staticText = document.createElement("span");
    staticText.textContent = message;

    const dots = document.createElement("span");
    dots.textContent = "";
    dots.style.display = "inline-block";
    dots.style.width = "1em"; // Feste Breite, damit nichts springt
    dots.style.textAlign = "left";

    let dotCount = 0;
    const dotInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4; // Animation zwischen 0 bis 3 Punkten
        dots.textContent = ".".repeat(dotCount);
    }, 500);

    messageContainer.appendChild(staticText);
    messageContainer.appendChild(dots);
    overlay.appendChild(messageContainer);

    // Erstelle den Schließen-Button (X)
    const closeButton = document.createElement("button");
    closeButton.textContent = "X";
    closeButton.style.position = "absolute";
    closeButton.style.top = "10px";
    closeButton.style.right = "10px";
    closeButton.style.backgroundColor = "transparent";
    closeButton.style.color = "#fff";
    closeButton.style.border = "none";
    closeButton.style.fontSize = "20px";
    closeButton.style.cursor = "pointer";
    closeButton.style.fontFamily = "Arial, sans-serif";
    closeButton.style.userSelect = "none"; // Verhindert Textmarkierung

    closeButton.addEventListener("click", () => {
        clearInterval(dotInterval); // Stoppe die Animation
        hideBlockingOverlay();
    });

    overlay.appendChild(closeButton);

    // Füge das Overlay zur Seite hinzu
    document.body.appendChild(overlay);

    // Blockiere Scrollen im Hintergrund
    document.body.style.overflow = "hidden";
}

// Funktion, um das Overlay zu entfernen
function hideBlockingOverlay() {
    const overlay = document.getElementById("blocking-overlay");
    if (overlay) {
        overlay.remove();
        document.body.style.overflow = ""; // Scrollen wieder aktivieren
    }
}

function loadSettingsModal() {
    fetch(chrome.runtime.getURL('settings.html'))
        .then(response => response.text())
        .then(settingsHTML => {
            const settings = document.createElement('div');
            settings.innerHTML = settingsHTML;
            document.body.appendChild(settings);

            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = chrome.runtime.getURL('settings.css');
            document.head.appendChild(cssLink);

            initializeSettingsModal();
        })
        .catch(err => console.error('Error loading settings modal:', err));
}

function initializeSettingsModal() {
    const modal = document.getElementById('extension-settings-modal');
    const overlay = document.getElementById('extension-settings-overlay');
    const autoSellerCheckbox = document.getElementById('auto-seller');
    const sellerAccountInput = document.getElementById('seller-account');
    const searchCheckbox = document.getElementById('search-extension');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');
    const closeButton = document.getElementById('close-button');
    const debugCheckbox = document.getElementById('extensionDebugMode');
    const alphaFeaturesCheckbox = document.getElementById('alphaFeatures');

    const typeFiltersCheckboxes = {
        'filter-item-category': 'Item Category',
        'filter-item-rarity': 'Item Rarity',
        'filter-item-level': 'Item Level',
        'filter-item-quality': 'Item Quality',
    };

    const equipmentFiltersCheckboxes = {
        'filter-equipment-block': 'Block',
    }

    const requirementCheckboxes = {
        'filter-requirements-level': 'Level',
        'filter-requirements-str': 'Strength',
        'filter-requirements-dex': 'Dexterity',
        'filter-requirements-int': 'Intelligence',
    };

    const statFiltersCheckboxes = {
        'filter-stat-default': 'Default'
    }

    if (!modal || !overlay) {
        console.error('One or more modal elements not found.');
        return;
    }

    modal.style.display = 'none';
    overlay.style.display = 'none';

    const settings = JSON.parse(localStorage.getItem('extensionSettings')) || {};
    autoSellerCheckbox.checked = settings.autoSeller || false;
    sellerAccountInput.disabled = !autoSellerCheckbox.checked;
    sellerAccountInput.value = settings.sellerAccount || '';
    searchCheckbox.checked = settings.searchExtension || false;
    debugCheckbox.checked = settings.debug || false;
    alphaFeaturesCheckbox.checked = settings.alphaFeatures || false;

    Object.keys(typeFiltersCheckboxes).forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = settings.typeFilters?.includes(typeFiltersCheckboxes[id]) || false;
        }
    });

    Object.keys(equipmentFiltersCheckboxes).forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = settings.equipmentFilters?.includes(equipmentFiltersCheckboxes[id]) || false;
        }
    });

    Object.keys(requirementCheckboxes).forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = settings.requirements?.includes(requirementCheckboxes[id]) || false;
        }
    });

    Object.keys(statFiltersCheckboxes).forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = settings.statFilters?.includes(statFiltersCheckboxes[id]) || false;
        }
    });

    autoSellerCheckbox.addEventListener('change', () => {
        sellerAccountInput.disabled = !autoSellerCheckbox.checked;
    });

    debugCheckbox.addEventListener('change', () => {
        debug = debugCheckbox.checked;
    });

    saveButton.addEventListener('click', () => {
        const updatedSettings = {
            autoSeller: autoSellerCheckbox.checked,
            sellerAccount: sellerAccountInput.value.trim(),
            typeFilters: Object.keys(typeFiltersCheckboxes).filter(id => document.getElementById(id)?.checked).map(id => typeFiltersCheckboxes[id]),
            equipmentFilters: Object.keys(equipmentFiltersCheckboxes).filter(id => document.getElementById(id)?.checked).map(id => equipmentFiltersCheckboxes[id]),
            requirements: Object.keys(requirementCheckboxes).filter(id => document.getElementById(id)?.checked).map(id => requirementCheckboxes[id]),
            statFilters: Object.keys(statFiltersCheckboxes).filter(id => document.getElementById(id)?.checked).map(id => statFiltersCheckboxes[id]),
            searchExtension: searchCheckbox.checked,
            debug: debugCheckbox.checked,
            alphaFeatures: alphaFeaturesCheckbox.checked,
        };

        const toggleGroups = document.querySelectorAll(".toggle-options");
        toggleGroups.forEach((group) => {
            const selectedOption = group.querySelector(".option.active");
            if (selectedOption) {
                updatedSettings[group.id] = selectedOption.dataset.value;
            }
        });

        localStorage.setItem('extensionSettings', JSON.stringify(updatedSettings));
        console.log('Settings saved:', updatedSettings);
        closeSettingsModal();
    });

    closeButton.addEventListener('click', closeSettingsModal);
    cancelButton.addEventListener('click', closeSettingsModal);

    const toggleGroups = document.querySelectorAll(".toggle-options");

    toggleGroups.forEach((group) => {
        const options = group.querySelectorAll(".option");
        const settingKey = group.id;
        const savedValue = settings[settingKey] || "min";

        options.forEach((option) => {
            if (option.dataset.value === savedValue) {
                option.classList.add("active");
            } else {
                option.classList.remove("active");
            }
        });

        options.forEach((option) => {
            option.addEventListener("click", () => {
                options.forEach((opt) => opt.classList.remove("active"));

                option.classList.add("active");

                console.log(`Selected for ${group.id}: ${option.dataset.value}`);
            });
        });
    });

    saveButton.click();
}

function closeSettingsModal() {
    const modal = document.getElementById('extension-settings-modal');
    const overlay = document.getElementById('extension-settings-overlay');

    if (modal && overlay) {
        modal.style.display = 'none';
        overlay.style.display = 'none';
    }
}

function toggleModal(visible) {
    const modal = document.getElementById('extension-settings-modal');
    const overlay = document.getElementById('extension-settings-overlay');
    if (modal && overlay) {
        modal.style.display = visible ? 'block' : 'none';
        overlay.style.display = visible ? 'block' : 'none';
    }
}

function getExtensionSettings() {
    return JSON.parse(localStorage.getItem('extensionSettings')) || {};
}

async function applyExtensionSettings() {
    const settings = getExtensionSettings();
    if (settings.autoSeller) {
        console.log('Auto Seller is enabled:', settings.sellerAccount);
    }
    if (settings.equipmentFilters) {
        console.log('Enabled Equipment Filters:', settings.equipmentFilters);
    }
    if (settings.typeFilters) {
        console.log('Enabled Type Filters:', settings.typeFilters);
    }
    if (settings.requirements) {
        console.log('Enabled Requirements:', settings.requirements);
    }
    if (settings.statFilters) {
        console.log('Enabled Requirements:', settings.statFilters);
    }
    if (settings.searchExtension) {
        console.log('Automatically Search is enabled:', settings.searchExtension);
    }

    const toggleGroups = document.querySelectorAll(".toggle-options");
    toggleGroups.forEach((group) => {
        const options = group.querySelectorAll(".option");
        const savedValue = settings[group.id] || "min";

        options.forEach((option) => {
            if (option.dataset.value === savedValue) {
                option.classList.add("active");
            } else {
                option.classList.remove("active");
            }
        });
    });
}

function findFilterGroupByTitle(title) {
    const filterTitles = document.querySelectorAll('.filter-title');

    for (const filterTitle of filterTitles) {
        const textContent = filterTitle.childNodes[0]?.nodeValue?.trim();
        if (textContent === title) {
            return filterTitle.closest('.filter');
        }
    }

    console.warn(`Filter "${title}" nicht gefunden.`);
    return null;
}

async function setMinMaxValues(filterTitle, min, max) {
    const filterGroup = findFilterGroupByTitle(filterTitle);
    if (!filterGroup) {
        console.warn(`Filter "${filterTitle}" nicht gefunden.`);
        return;
    }

    const minInput = filterGroup.querySelector('input[placeholder="min"]');
    const maxInput = filterGroup.querySelector('input[placeholder="max"]');

    if (minInput) {
        await setInputValue(minInput, min);
    } else {
        console.warn(`Min-Eingabefeld für "${filterTitle}" nicht gefunden.`);
    }

    if (maxInput) {
        await setInputValue(maxInput, max);
    } else {
        console.warn(`Max-Eingabefeld für "${filterTitle}" nicht gefunden.`);
    }
}

// Elements container
const elements = {
    button_searchListedItems: null,
    button_bulkItemExchange: null,
    link_searchListedItems: null,
    link_bulkItemExchange: null,
    div_searchLeft: null,
    div_searchRight: null,
    input_searchItems: null,
    input_league: null,
    input_status: null,
    button_active_search: null,
    button_search: null,
    button_clear: null,
    button_showFilters: null,

    // Type Filters
    checkbox_typeFilters: null,
    input_itemCategory: null,
    input_itemRarity: null,
    input_itemLevelMin: null,
    input_itemLevelMax: null,
    input_itemQualityMin: null,
    input_itemQualityMax: null,

    // Equipment Filters
    checkbox_equipmentFilters: null,
    input_damageMin: null,
    input_damageMax: null,
    input_apsMin: null,
    input_apsMax: null,
    input_critChanceMin: null,
    input_critChanceMax: null,
    input_dpsMin: null,
    input_dpsMax: null,
    input_physicalDpsMin: null,
    input_physicalDpsMax: null,
    input_elementalDpsMin: null,
    input_elementalDpsMax: null,
    input_armourMin: null,
    input_armourMax: null,
    input_evasionMin: null,
    input_evasionMax: null,
    input_energyShieldMin: null,
    input_energyShieldMax: null,
    input_blockMin: null,
    input_blockMax: null,
    input_spiritMin: null,
    input_spiritMax: null,
    input_emptyRuneSocketMin: null,
    input_emptyRuneSocketMax: null,

    // Requirements
    checkbox_requirements: null,
    input_levelMin: null,
    input_levelMax: null,
    input_strengthMin: null,
    input_strengthMax: null,
    input_dexterityMin: null,
    input_dexterityMax: null,
    input_intelligenceMin: null,
    input_intelligenceMax: null,

    // Waystone Filters
    checkbox_waystoneFilters: null,
    input_waystoneTierMin: null,
    input_waystoneTierMax: null,
    input_waystoneDropChanceMin: null,
    input_waystoneDropChanceMax: null,

    // Miscellaneous
    checkbox_miscellaneous: null,
    input_gemLevelMin: null,
    input_gemLevelMax: null,
    input_gemSocketsMin: null,
    input_gemSocketsMax: null,
    input_areaLevelMin: null,
    input_areaLevelMax: null,
    input_stackSizeMin: null,
    input_stackSizeMax: null,
    input_identified: null,
    input_corrupted: null,
    input_mirrored: null,
    input_alternateArt: null,
    input_baryaSacredWaterMin: null,
    input_baryaSacredWaterMax: null,
    input_unidentifiedTierMin: null,
    input_unidentifiedTierMax: null,

    // Trade Filters
    checkbox_tradeFilters: null,
    input_sellerAccount: null,
    input_collapseListingsByAccount: null,
    input_listed: null,
    input_saleType: null,
    input_buyoutPrice: null,
    input_buyoutPriceMin: null,
    input_buyoutPriceMax: null,

    // Stat Filters
    checkbox_statFilters: null
};

// Selectors mapping for elements
const elementSelectors = {
    button_searchListedItems: '.menu-search',
    button_bulkItemExchange: '.menu-exchange',
    link_searchListedItems: '.menu-search > a',
    link_bulkItemExchange: '.menu-exchange > a',
    div_searchLeft: '.search-bar .search-left',
    div_searchRight: '.search-bar .search-right',
    input_searchItems: '.search-bar .search-left .multiselect__input',
    input_league: '.search-bar .search-right .multiselect.status-select:nth-of-type(1) .multiselect__single',
    input_status: '.search-bar .search-right .multiselect.status-select:nth-of-type(2) .multiselect__single',
    button_active_search: '.controls .controls-left .livesearch-btn',
    button_search: '.controls .controls-center .search-btn',
    button_clear: '.controls .controls-right .clear-btn',
    button_showFilters: '.controls .controls-right .toggle-search-btn',

    // Type Filters
    checkbox_typeFilters: '.search-advanced-pane.blue .filter-group:nth-of-type(1) .filter-group-header .toggle-btn',
    input_itemCategory: '.filter-group-body .filter-property:nth-of-type(1) .multiselect__input',
    input_itemRarity: '.filter-group-body .filter-property:nth-of-type(2) .multiselect__input',
    input_itemLevelMin: '.search-advanced-pane.blue .filter-group:nth-of-type(1) .filter.filter-property:nth-of-type(3) input:first-of-type',
    input_itemLevelMax: '.search-advanced-pane.blue .filter-group:nth-of-type(1) .filter.filter-property:nth-of-type(3) input:last-of-type',
    input_itemQualityMin: '.search-advanced-pane.blue .filter-group:nth-of-type(1) .filter.filter-property:nth-of-type(4) input:first-of-type',
    input_itemQualityMax: '.search-advanced-pane.blue .filter-group:nth-of-type(1) .filter.filter-property:nth-of-type(4) input:last-of-type',

    // Equipment Filters
    checkbox_equipmentFilters: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter-group-header .toggle-btn',
    input_damageMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(1) input:first-of-type',
    input_damageMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(1) input:last-of-type',
    input_apsMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(2) input:first-of-type',
    input_apsMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(2) input:last-of-type',
    input_critChanceMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(3) input:first-of-type',
    input_critChanceMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(3) input:last-of-type',
    input_dpsMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(4) input:first-of-type',
    input_dpsMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(4) input:last-of-type',
    input_physicalDpsMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(5) input:first-of-type',
    input_physicalDpsMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(5) input:last-of-type',
    input_elementalDpsMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(6) input:first-of-type',
    input_elementalDpsMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(6) input:last-of-type',
    input_armourMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(7) input:first-of-type',
    input_armourMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(7) input:last-of-type',
    input_evasionMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(8) input:first-of-type',
    input_evasionMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(8) input:last-of-type',
    input_energyShieldMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(9) input:first-of-type',
    input_energyShieldMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(9) input:last-of-type',
    input_blockMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(10) input:first-of-type',
    input_blockMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(10) input:last-of-type',
    input_spiritMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(11) input:first-of-type',
    input_spiritMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(11) input:last-of-type',
    input_emptyRuneSocketMin: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(12) input:first-of-type',
    input_emptyRuneSocketMax: '.search-advanced-pane.blue .filter-group:nth-of-type(2) .filter.filter-property:nth-of-type(12) input:last-of-type',

    // Requirements
    checkbox_requirements: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter-group-header .toggle-btn',
    input_levelMin: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter.filter-property:nth-of-type(1) input:first-of-type',
    input_levelMax: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter.filter-property:nth-of-type(1) input:last-of-type',
    input_strengthMin: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter.filter-property:nth-of-type(2) input:first-of-type',
    input_strengthMax: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter.filter-property:nth-of-type(2) input:last-of-type',
    input_dexterityMin: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter.filter-property:nth-of-type(3) input:first-of-type',
    input_dexterityMax: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter.filter-property:nth-of-type(3) input:last-of-type',
    input_intelligenceMin: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter.filter-property:nth-of-type(4) input:first-of-type',
    input_intelligenceMax: '.search-advanced-pane.blue .filter-group:nth-of-type(3) .filter.filter-property:nth-of-type(4) input:last-of-type',

    // Waystone Filters
    checkbox_waystoneFilters: '.search-advanced-pane.blue .filter-group:nth-of-type(4) .filter-group-header .toggle-btn',
    input_waystoneTierMin: '.search-advanced-pane.blue .filter-group:nth-of-type(4) .filter.filter-property:nth-of-type(1) input:first-of-type',
    input_waystoneTierMax: '.search-advanced-pane.blue .filter-group:nth-of-type(4) .filter.filter-property:nth-of-type(1) input:last-of-type',
    input_waystoneDropChanceMin: '.search-advanced-pane.blue .filter-group:nth-of-type(4) .filter.filter-property:nth-of-type(2) input:first-of-type',
    input_waystoneDropChanceMax: '.search-advanced-pane.blue .filter-group:nth-of-type(4) .filter.filter-property:nth-of-type(2) input:last-of-type',

    // Miscellaneous
    checkbox_miscellaneous: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter-group-header .toggle-btn',
    input_gemLevelMin: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(1) input:first-of-type',
    input_gemLevelMax: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(1) input:last-of-type',
    input_gemSocketsMin: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(2) input:first-of-type',
    input_gemSocketsMax: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(2) input:last-of-type',
    input_areaLevelMin: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(3) input:first-of-type',
    input_areaLevelMax: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(3) input:last-of-type',
    input_stackSizeMin: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(4) input:first-of-type',
    input_stackSizeMax: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(4) input:last-of-type',
    input_identified: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(5) .multiselect .multiselect__input',
    input_corrupted: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(6) .multiselect .multiselect__input',
    input_mirrored: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(7) .multiselect .multiselect__input',
    input_alternateArt: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(8) .multiselect .multiselect__input',
    input_baryaSacredWaterMin: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(9) input:first-of-type',
    input_baryaSacredWaterMax: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(9) input:last-of-type',
    input_unidentifiedTierMin: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(10) input:first-of-type',
    input_unidentifiedTierMax: '.search-advanced-pane.blue .filter-group:nth-of-type(5) .filter.filter-property:nth-of-type(10) input:last-of-type',

    // Trade Filters
    checkbox_tradeFilters: '.search-advanced-pane.blue .filter-group:nth-of-type(6) .filter-group-header .toggle-btn',
    input_sellerAccount: '.search-advanced-pane.blue .filter-group:nth-of-type(6) .filter.filter-property:nth-of-type(1) input',
    input_collapseListingsByAccount: '.search-advanced-pane.blue .filter-group:nth-of-type(6) .filter.filter-property:nth-of-type(2) .multiselect .multiselect__input',
    input_listed: '.search-advanced-pane.blue .filter-group:nth-of-type(6) .filter.filter-property:nth-of-type(3) .multiselect .multiselect__input',
    input_saleType: '.search-advanced-pane.blue .filter-group:nth-of-type(6) .filter.filter-property:nth-of-type(4) .multiselect .multiselect__input',
    input_buyoutPrice: '.search-advanced-pane.blue .filter-group:nth-of-type(6) .filter.filter-property:nth-of-type(5) .multiselect .multiselect__input',
    input_buyoutPriceMin: '.search-advanced-pane.blue .filter-group:nth-of-type(6) .filter.filter-property:nth-of-type(5) input:first-of-type',
    input_buyoutPriceMax: '.search-advanced-pane.blue .filter-group:nth-of-type(6) .filter.filter-property:nth-of-type(5) input:last-of-type',

    // Stat Filters
    checkbox_statFilters: '.search-advanced-pane.brown .filter-group .filter-group-header .toggle-btn'
};

function areAllElementsFound() {
    return Object.values(elements).every(element => element !== null);
}

function findMissingElementsVerbose() {
    console.log("Checking for missing elements...");
    Object.entries(elementSelectors).forEach(([key, selector]) => {
        if (!elements[key]) {
            const element = document.querySelector(selector);
            if (element) {
                elements[key] = element;
                console.log(`✅ Element found for ${key}:`, element);
            } else {
                console.warn(`❌ Element not found for ${key}. Selector: ${selector}`);
            }
        }
    });

    // Übersicht über alle fehlenden Elemente
    const missingElements = Object.keys(elements).filter(key => elements[key] === null);
    if (missingElements.length > 0) {
        console.warn("Missing elements:", missingElements);
    } else {
        console.log("🎉 All elements are found!");
    }
}

async function initializeAddEventListeners() {
    if (elements.link_searchListedItems && elements.button_searchListedItems) {
        if (importButton) {
            if (elements.button_searchListedItems.classList.contains('active')) {
                importButton.disabled = false;
            }
        }

        elements.link_searchListedItems.addEventListener('click', () => {
            if (importButton) {
                if (elements.button_searchListedItems.classList.contains('active')) {
                    importButton.disabled = false;
                }
            }
        });
    }

    if (elements.link_bulkItemExchange && elements.button_bulkItemExchange) {
        if (importButton) {
            if (elements.button_bulkItemExchange.classList.contains('active')) {
                importButton.disabled = true;
            }
        }

        elements.link_bulkItemExchange.addEventListener('click', () => {
            if (importButton) {
                if (elements.button_bulkItemExchange.classList.contains('active')) {
                    importButton.disabled = true;
                }
            }
        });
    }
}

async function initializeUpdate() {
    const tabs = document.querySelectorAll("#tabs .tab");
    const tabContents = document.querySelectorAll(".tab-content");

    // Tab Switching
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const targetTab = tab.getAttribute("data-tab");

            tabs.forEach((t) => t.classList.remove("active"));
            tabContents.forEach((content) => content.classList.remove("active"));

            tab.classList.add("active");
            document.getElementById(targetTab).classList.add("active");
        });
    });

    // Sub-Tabs Switching
    const subTabs = document.querySelectorAll(".sub-tabs .sub-tab");
    const subTabContents = document.querySelectorAll(".sub-tab-content");

    subTabs.forEach((subTab) => {
        subTab.addEventListener("click", () => {
            const targetSubTab = subTab.getAttribute("data-sub-tab");

            subTabs.forEach((tab) => tab.classList.remove("active"));
            subTabContents.forEach((content) => content.classList.remove("active"));

            subTab.classList.add("active");
            document.getElementById(targetSubTab).classList.add("active");
        });
    });

    const updateItems = [
        { name: "modifiers.json", path: "modifiers.json", lastUpdateTime: 0 },
        { name: "itemCategory.json", path: "itemCategory.json", lastUpdateTime: 0 },
        { name: "mapChatItems.json", path: "mapChatItems.json", lastUpdateTime: 0 }
    ];

    const repoOwner = "SkiperTheBoss";
    const repoName = "PoE2TradeExt";
    const branch = "master";
    const RATE_LIMIT_DELAY = 1000 * 60; // 1 Minute Mindestabstand pro Update

    for (const item of updateItems) {
        const localDate = localStorage.getItem(`${item.name}-lastUpdated`);
        const parent = document.querySelector(`.update-item[data-name="${item.name}"]`);
        const dateElement = parent.querySelector(".update-date");
        const updateButton = parent.querySelector(".update-button");

        // Zeige gespeichertes Datum an, falls vorhanden
        dateElement.textContent = localDate ? `Last updated: ${new Date(localDate).toLocaleString()}` : "Last updated: N/A";

        updateButton.addEventListener("click", async () => {
            const now = Date.now();
            if (now - item.lastUpdateTime < RATE_LIMIT_DELAY) {
                alert("Please wait a minute before trying to update this item again.");
                return;
            }

            item.lastUpdateTime = now;
            console.log(`Checking for updates for ${item.name}...`);

            // Button deaktivieren und Indikator hinzufügen
            updateButton.disabled = true;
            dateElement.innerHTML = "<span class='loading-indicator'>Updating...</span>";

            try {
                // GitHub API URL für Datei-Metadaten
                const fileApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${item.path}?ref=${branch}`;
                const fileResponse = await fetch(fileApiUrl);

                if (!fileResponse.ok) {
                    throw new Error(`GitHub API request failed for ${item.name}`);
                }

                const fileData = await fileResponse.json();

                // GitHub API URL für Commit-Informationen
                const commitsApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits?path=${item.path}&sha=${branch}`;
                const commitsResponse = await fetch(commitsApiUrl);

                if (!commitsResponse.ok) {
                    throw new Error(`Failed to fetch commit info for ${item.name}`);
                }

                const commitsData = await commitsResponse.json();
                const latestCommitDate = new Date(commitsData[0].commit.author.date);

                const localTimestamp = localDate ? new Date(localDate).getTime() : 0;
                const githubTimestamp = latestCommitDate.getTime();

                if (githubTimestamp > localTimestamp) {
                    console.log(`Updating ${item.name}...`);

                    // Fetch the new content
                    const contentResponse = await fetch(fileData.download_url);
                    const content = await contentResponse.text();

                    // Save content and update the last modified date
                    localStorage.setItem(`${item.name}`, content);
                    localStorage.setItem(`${item.name}-lastUpdated`, latestCommitDate.toISOString());

                    // Update the display
                    dateElement.textContent = `Last updated: ${latestCommitDate.toLocaleString()}`;
                    alert(`${item.name} has been updated!`);

                    // Aktualisiere globale Variablen
                    if (item.name === "modifiers.json") {
                        modifiers = JSON.parse(content);
                    } else if (item.name === "itemCategory.json") {
                        itemCategory = JSON.parse(content);
                    } else if (item.name === "mapChatItems.json") {
                        mapChatItems = JSON.parse(content);
                    }
                } else {
                    alert(`${item.name} is already up-to-date.`);
                    dateElement.textContent = `Last updated: ${new Date(localDate).toLocaleString()}`;
                }
            } catch (error) {
                console.error(error);
                alert(`Could not fetch update info for ${item.name}`);
                dateElement.textContent = localDate ? `Last updated: ${new Date(localDate).toLocaleString()}` : "Last updated: N/A";
            } finally {
                // Button wieder aktivieren
                updateButton.disabled = false;
            }
        });
    }
}

// Funktion, die den Rest des Codes initialisiert
async function initializeApp() {
    try {
        await waitForElementToBeVisible('.menu-search');
        // Detaillierte Überprüfung der fehlenden Elemente
        findMissingElementsVerbose();

        // If all elements are found, proceed with initialization
        if (areAllElementsFound()) {
            console.log('All elements found. Initializing main script...');

            try {
                await applyExtensionSettings();
                console.log('applyExtensionSettings completed.');

                await initializeSearchButton();
                console.log('initializeSearchButton completed.');

                await initializeAddEventListeners();
                console.log('initializeAddEventListeners completed.');

                await initializeExtensionSettingsButton();
                console.log('initializeExtensionSettingsButton completed.');

                /*
                await initializeUpdate();
                console.log('initializeUpdate completed.');
                */

                const settings = await getExtensionSettings();
                if (settings.alphaFeatures) {
                  await initializeExtensionFavoriteButton();
                  console.log('initializeExtensionFavoriteButton completed.');
                }

                console.log('All initializations completed successfully.');
            } catch (error) {
                console.error('An error occurred during initialization:', error);
            }
        }
    } catch (error) {
        console.error(error.message);
    }
}

const waitForElementToBeVisible = async (selector, timeout = 10000) => {
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
                console.log(`Element "${selector}" is now visible.`);
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element "${selector}" to be visible.`));
        }, timeout);
    });
};
