import { Plugin, TFile, MarkdownView, FrontMatterCache, FileSystemAdapter, parseFrontMatterEntry } from 'obsidian';
import { TemplateSuggestModal } from 'modals';
import { MetamatterSettings, MetamatterSettingTab, DEFAULT_SETTINGS } from './mmsettings'

import * as jsyaml from './js-yaml';

export default class Metamatter extends Plugin {
	settings: MetamatterSettings;
	templates: Array<TFile>;
	type2titles: Map<string, string>;

	async onload() {
		console.log('loading metamatter');

		await this.loadSettings();

		this.addCommand({
			id: 'reload-templates',
			name: 'Reload templates',
			callback: () => {
				this.reloadTemplates();
			}
		});

		this.addCommand({
			id: 'insert-template',
			name: 'Insert Template',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						new TemplateSuggestModal(this.app, this).open();
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'create-with-template',
			name: 'Create with template',
			checkCallback: (checking: boolean) => {


				if (!checking) {
					let newfile =  this.app.vault.create(this.getDTstring() + '.md', '');
					newfile.then((file) => {
						let leaf = this.app.workspace.activeLeaf;
						if (leaf) {
							leaf.openFile(file);
						}
					})
				}

				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						new TemplateSuggestModal(this.app, this).open();
					}
					return true;
				}
				return false;
			}
		});

		this.app.metadataCache.on('changed', (file: TFile) => {
			if (file.path.indexOf(this.settings.templateFolder) == 0) {
				return;
			}

			let fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			let fnf = this.type2titles.get(parseFrontMatterEntry(fm, 'type'));

			let newfn = this.fnf2fn(fm, fnf);

			if (newfn) {
				let newpath = file.path.substring(0, file.path.lastIndexOf('/')) + '/' + newfn + '.md';
				if (newpath && newpath != file.path) {
					this.app.fileManager.renameFile(file, newpath);
					// (new FileSystemAdapter).exists(newpath).then((res: boolean) => {
					// 	if (!res) {
					// 		this.app.fileManager.renameFile(file, newpath);
					// 	}
					// })
				}
			}
		});


		this.addSettingTab(new MetamatterSettingTab(this.app, this));

		this.reloadTemplates();
	}

	reloadTemplates() {
		let files = this.app.vault.getMarkdownFiles();

		this.templates = [];
		this.type2titles = new Map();

		for (var file of files) {
			if (file.path.indexOf(this.settings.templateFolder) == 0) {
				this.templates.push(file);
				let fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				let type = parseFrontMatterEntry(fm, 'type');
				let nameFormat = parseFrontMatterEntry(fm, 'nameFormat');
				this.type2titles.set(type, nameFormat);
			}
		}

		console.log("metamatter: loaded " + this.type2titles.size + " templates!")
	}

	fnf2fn(fm: FrontMatterCache, fnf: string): string {
		let newfn = fnf;

		if (!newfn) {
			return;
		}

		let startInd = newfn.indexOf("<<");
		let endInd = newfn.indexOf(">>");
		while (startInd > -1 && endInd > startInd+1) {
			let attrName = newfn.substring(startInd+2, endInd);
			if (fm[attrName]) {
				newfn = newfn.substring(0, startInd) + fm[attrName] + newfn.substring(endInd+2);
			} else {
				newfn = newfn.substring(0, startInd) + attrName + newfn.substring(endInd+2);
			}
			startInd = newfn.indexOf("<<");
			endInd = newfn.indexOf(">>");
		}

		newfn = newfn.replace(/[/\\?%*:|"<>]/g, '-');
		return newfn;
	}

	getDTstring(): string {
		let now = new Date();
		let ye = new Intl.DateTimeFormat('en', { year: '2-digit' }).format(now);
		let mo = new Intl.DateTimeFormat('en', { month: '2-digit' }).format(now);
		let da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(now);
		let hr = new Intl.DateTimeFormat('en', { hour: '2-digit', hour12: false }).format(now);
		let mn = new Intl.DateTimeFormat('en', { hour: '2-digit', hour12: false, minute: '2-digit' }).format(now).substring(3);

		return ye + mo + da + '@' + hr + mn;
	}

	async insertTemplate(templateFile: TFile) {
		// mildly plagiarized from https://github.com/SilentVoid13/Templater/
		let active_view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active_view == null) {
        return;
    }

    let editor = active_view.sourceMode.cmEditor;
    let doc = editor.getDoc();

    let content = await this.app.vault.read(templateFile);
		content = await this.fillTemplate(content);

    doc.replaceSelection(content);
    editor.focus();
	}

	async fillTemplate(content: string) {
		let fmraw = content.substring(content.indexOf('---')+4, content.lastIndexOf('---')-1);
		let fmparsed = jsyaml.load(fmraw);

		if (fmparsed['addCreated']) {
			delete fmparsed['addCreated'];

			let dtstring = this.getDTstring();

			fmparsed['created'] = dtstring;
		}

		if (fmparsed['nameFormat']) {
			delete fmparsed['nameFormat'];
		}

		let dump = jsyaml.dump(fmparsed);
		dump = dump.replace(/\:null/gi, "\:\"\"");
		dump = dump.replace("\n  - ''", " ['']");
		let ans = '---\n' + dump + content.substring(content.lastIndexOf('---'));

		return ans;
	}

	onunload() {
		console.log('unloading metamatter');
	}

	async loadSettings() {
		this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
