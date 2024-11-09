import { App, Modal, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "add-file-property-to-folder",
			name: "Add File Property to Folder",
			callback: async () => {
				// Prompt user to select a folder
				const folder = await this.selectFolder();
				if (folder) {
					// Add the file property to each file in the selected folder
					await this.addFilePropertyToFiles(folder);
				}
			}
		});
	}

	async selectFolder(): Promise<TFolder | null> {
		return new Promise((resolve) => {
			const modal = new FolderSelectionModal(this.app, (selectedFolder) => {
				resolve(selectedFolder);
				modal.close();
			});
			modal.open();
		});
	}

	async addFilePropertyToFiles(folder: TFolder) {
		const files = folder.children.filter((item) => item instanceof TFile && item.extension === "md") as TFile[];

		// Generate the link based on the folder's path
		const relatedNotesLink = `[[${folder.path}]]`;

		for (const file of files) {
			let fileContent = await this.app.vault.read(file);

			// Step 1: Find the YAML front matter (between ---)
			//const firstLine = fileContent.split('\n', 1)[0];
			const firstLine = fileContent.split('\n', 1)[0];
			const yamlStartIndex = firstLine.indexOf('---');
			const yamlEndIndex = fileContent.indexOf('---', yamlStartIndex + 3);

			// Case 1: No YAML front matter found
			if (yamlStartIndex === -1 || yamlEndIndex === -1) {
				await this.noYamlFrontMatter(relatedNotesLink, fileContent, file);
			} else {
				// Case 2: YAML front matter found
				await this.withYamlFrontMatter(fileContent, yamlStartIndex, yamlEndIndex, relatedNotesLink, file);
			}
		}

		const subfolders = folder.children.filter((item) => item instanceof TFolder) as TFolder[];
		for (const subfolder of subfolders) {
			await this.addFilePropertyToFiles(subfolder); // Recursive call on each subfolder
		}
	}

	private async noYamlFrontMatter(relatedNotesLink: string, fileContent: string, file: TFile) {
		console.log('No YAML front matter found');

		// Add YAML front matter with related_notes at the top of the file
		const newYAML = `---\nrelated_notes:\n  - \"${relatedNotesLink}\"\n---\n`;

		const updatedContent = newYAML + fileContent;
		await this.app.vault.modify(file, updatedContent);
		console.log(`Added 'related_notes' to file: ${file.path}`);
	}

	private async withYamlFrontMatter(fileContent: string, yamlStartIndex: number, yamlEndIndex: number, relatedNotesLink: string, file: TFile) {
		const yamlContent = fileContent.slice(yamlStartIndex + 3, yamlEndIndex).trim();
		console.log('yamlContent', yamlContent);

		// Check if 'related_notes' exists in the YAML
		const relatedNotesPattern = /related_notes:/;

		if (relatedNotesPattern.test(yamlContent)) {
			await this.hasRelatedNotesProperty(relatedNotesLink, fileContent, yamlStartIndex, yamlContent, yamlEndIndex, file);
		} else {
			await this.noRelatedNotesProperty(relatedNotesLink, fileContent, yamlStartIndex, yamlContent, yamlEndIndex, file);
		}
	}

	private async hasRelatedNotesProperty(
		relatedNotesLink: string,
		fileContent: string,
		yamlStartIndex: number,
		yamlContent: string,
		yamlEndIndex: number,
		file: TFile
	) {
		console.log('Checking if related_notes contains the link');

		// Search for related_notes line
		const relatedNotesIndex = yamlContent.indexOf('related_notes:');
		if (relatedNotesIndex === -1) {
			console.error(`'related_notes' not found`)
			return;
		}

		// Case 1: related_notes is found, now check the format
		console.log('related_notes property found');

		// Check if it's in array format or comma-separated format
		const arrayStartIndex = yamlContent.indexOf('-', relatedNotesIndex);
		if (arrayStartIndex !== -1) {
			console.log('related_notes is in array format');

			const preArraySlice = yamlContent.slice(relatedNotesIndex, arrayStartIndex);

			// Find the last newline in this slice and count spaces after it
			const lastNewlineIndex = preArraySlice.lastIndexOf('\n');
			const indentationCount = arrayStartIndex - (relatedNotesIndex + lastNewlineIndex + 1);
			console.log('indentationCount:', indentationCount);

			const indentation = ' '.repeat(indentationCount)
			console.log('indentation:', indentation);

			// Array format: add the new link as a new item in the list
			const newYAML = indentation + `- \"${relatedNotesLink}\"`;
			console.log('newYAML', newYAML);

			const nextPropertyPattern = /\n\w+:/;
			const nextPropertyMatch = yamlContent.slice(arrayStartIndex).search(nextPropertyPattern);
			const relatedNotesEndIndex = nextPropertyMatch === -1
				? yamlContent.length
				: arrayStartIndex + nextPropertyMatch;

			// Isolate the `related_notes` array section
			const relatedNotesSlice = yamlContent.slice(arrayStartIndex, relatedNotesEndIndex);

			// Check if the new link already exists in this section
			if (relatedNotesSlice.includes(newYAML.trim())) return;

			console.group('array')

			console.log('fileContent', fileContent);
			console.log('yamlContent', yamlContent);

			console.log('fileContent.slice(0, yamlStartIndex + 3)', fileContent.slice(0, yamlStartIndex + 3));
			console.log('yamlContent.slice(0, relatedNotesIndex)', yamlContent.slice(0, relatedNotesIndex));
			console.log('yamlContent.slice(0, relatedNotesIndex + 14)', yamlContent.slice(0, relatedNotesIndex + 14));
			console.log('newYAML', newYAML);
			console.log('yamlContent.slice(arrayStartIndex)', yamlContent.slice(arrayStartIndex));
			console.log('fileContent.slice(yamlEndIndex)', fileContent.slice(yamlEndIndex));

			const updatedContent = fileContent.slice(0, yamlStartIndex + 3)
				+ '\n'
				+ yamlContent.slice(0, relatedNotesIndex + "related_notes:".length)
				+ '\n'
				+ newYAML
				+ '\n'
				+ indentation
				+ yamlContent.slice(arrayStartIndex)
				+ '\n'
				+ fileContent.slice(yamlEndIndex);
			console.log('updatedContent', updatedContent);

			console.groupEnd()

			await this.app.vault.modify(file, updatedContent);
		} else {
			console.log('related_notes is in comma-separated format');
			const commaSeparatedIndex = yamlContent.indexOf('related_notes:', relatedNotesIndex);
			// Comma-separated format: add the new link at the end of the line
		}
	}

	private async noRelatedNotesProperty(
		relatedNotesLink: string,
		fileContent: string,
		yamlStartIndex: number,
		yamlContent: string,
		yamlEndIndex: number,
		file: TFile
	) {
		console.log('related_notes property not found');

		// Case 3: `related_notes` is not found in the existing YAML, so add it at the start
		const newYAML = `related_notes:\n  - \"${relatedNotesLink}\"`;

		// Remove existing --- markers and insert the new YAML
		const updatedContent = fileContent.slice(0, yamlStartIndex + 3)
			+ '\n'
			+ newYAML
			+ '\n'
			+ yamlContent
			+ '\n'
			+ fileContent.slice(yamlEndIndex);
		await this.app.vault.modify(file, updatedContent);
		console.log(`Added 'related_notes' to existing YAML front matter in file: ${file.path}`);
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// Custom Modal to Select a Folder
class FolderSelectionModal extends Modal {
	private onSelect: (folder: TFolder | null) => void;

	constructor(app: App, onSelect: (folder: TFolder | null) => void) {
		super(app);
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Select a Folder" });

		// Create a search input for filtering folders
		const searchInput = contentEl.createEl("input", {
			type: "text",
			placeholder: "Search for a folder...",
		});

		// Style the search input
		searchInput.style.width = "100%";
		searchInput.style.padding = "8px";
		searchInput.style.marginBottom = "10px";

		const list = contentEl.createEl("ul");
		list.style.minHeight = "200px";  // Set a max height to add a scroll if needed
		list.style.maxHeight = "200px";  // Set a max height to add a scroll if needed
		list.style.overflowY = "auto";   // Enable vertical scrolling
		list.style.listStyleType = "none";
		list.style.paddingLeft = "0";

		// Get all folders and render the list
		const folders = this.app.vault.getAllLoadedFiles()
			.filter((file) => file instanceof TFolder) as TFolder[];

		// Function to update the displayed list based on the search input
		const updateList = (filterText: string) => {
			list.empty();
			folders
				.filter(folder => folder.path.toLowerCase().includes(filterText.toLowerCase()))
				.forEach(folder => {
					const li = list.createEl("li");

					// Style each list item
					li.style.cursor = "pointer";
					li.style.padding = "5px";
					li.style.marginBottom = "5px";
					li.style.textDecoration = "underline";
					li.style.color = "#007acc";  // Optional: Change color to make it look more like a link

					li.textContent = folder.path;
					li.addEventListener("click", () => {
						this.onSelect(folder);
						this.close();
					});
				});
		};

		// Initial list render without filtering
		updateList("");

		// Add input event listener for real-time search filtering
		searchInput.addEventListener("input", (event) => {
			const filterText = (event.target as HTMLInputElement).value;
			updateList(filterText);
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}


class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
