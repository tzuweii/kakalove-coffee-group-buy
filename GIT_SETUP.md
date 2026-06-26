# Git 設定紀錄

## 基本資訊

| 項目 | 值 |
|---|---|
| 使用者名稱 | tzuwei |
| Email | tzuweichengkor@gmail.com |
| Remote | git@github.com:tzuweii/kakalove-coffee-group-buy.git |
| 主分支 | main |

---

## macOS 設定流程

### 1. Git 全域設定

```bash
git config --global user.name tzuwei
git config --global user.email tzuweichengkor@gmail.com
```

### 2. 初始化專案

```bash
git init
git add .
git commit -m "Initial commit"
```

### 3. 建立 .gitignore

```bash
echo ".DS_Store" > .gitignore
git add .gitignore
git commit -m "Add .gitignore"

# 將已追蹤的 .DS_Store 移除
git rm --cached .DS_Store
git commit -m "Remove .DS_Store from tracking"
```

### 4. 連接 GitHub Remote

```bash
git remote add origin https://github.com/tzuweii/kakalove-coffee-group-buy.git
```

### 5. SSH 金鑰設定

```bash
# 產生 SSH key
ssh-keygen -t ed25519 -C "tzuweichengkor@gmail.com"

# 公鑰位置（複製內容後貼到 GitHub）
cat ~/.ssh/id_ed25519.pub

# 加到 GitHub：Settings → SSH and GPG keys → New SSH key

# 信任 GitHub host
ssh-keyscan github.com >> ~/.ssh/known_hosts

# 測試連線（出現 "Hi tzuweii!" 表示成功）
ssh -T git@github.com
```

### 6. 改用 SSH Remote 並推送

```bash
# 切換 remote 為 SSH 格式
git remote set-url origin git@github.com:tzuweii/kakalove-coffee-group-buy.git

# 推送並設定 upstream
git push -u origin main
git fetch origin
git branch --set-upstream-to=origin/main main
```

---

## Windows 設定流程

### 1. Git 全域設定

```powershell
git config --global user.name tzuwei
git config --global user.email tzuweichengkor@gmail.com
```

### 2. SSH 金鑰設定

```powershell
# 產生 SSH key
ssh-keygen -t ed25519 -C "tzuweichengkor@gmail.com"
# 出現路徑詢問直接按 Enter，passphrase 也直接按 Enter 跳過

# 複製公鑰內容
cat ~/.ssh/id_ed25519.pub
# 將輸出內容貼到 GitHub：Settings → SSH and GPG keys → New SSH key
# Title 建議填 windows-tzuwei 方便辨識

# 信任 GitHub host
ssh-keyscan github.com >> ~/.ssh/known_hosts

# 測試連線（出現 "Hi tzuweii!" 表示成功）
ssh -T git@github.com
```

### 3. 修正 Windows git 使用的 SSH 程式（必要步驟）

Windows 上 git 預設不使用系統的 OpenSSH，需手動指定：

```powershell
git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"
```

> ⚠️ 此步驟是 Windows 獨有的問題。`ssh -T` 測試成功但 `git clone` 仍失敗時，
> 幾乎都是這個原因（git 用的 SSH 與系統用的 SSH 不同）。

### 4. Clone 專案

```powershell
git clone git@github.com:tzuweii/kakalove-coffee-group-buy.git
```

---

## 在新裝置快速設定

### macOS

```bash
# 1. 安裝 Git
xcode-select --install

# 2. 全域設定
git config --global user.name tzuwei
git config --global user.email tzuweichengkor@gmail.com

# 3. 產生 SSH key 並加到 GitHub（同上方步驟 5）
ssh-keygen -t ed25519 -C "tzuweichengkor@gmail.com"
cat ~/.ssh/id_ed25519.pub
# → 貼到 GitHub Settings → SSH and GPG keys

# 4. Clone 專案
git clone git@github.com:tzuweii/kakalove-coffee-group-buy.git
```

### Windows

```powershell
# 1. 全域設定
git config --global user.name tzuwei
git config --global user.email tzuweichengkor@gmail.com

# 2. 產生 SSH key 並加到 GitHub
ssh-keygen -t ed25519 -C "tzuweichengkor@gmail.com"
cat ~/.ssh/id_ed25519.pub
# → 貼到 GitHub Settings → SSH and GPG keys（Title 填 windows-tzuwei）

# 3. 信任 GitHub host 並測試
ssh-keyscan github.com >> ~/.ssh/known_hosts
ssh -T git@github.com

# 4. 指定 SSH 程式（Windows 必要）
git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"

# 5. Clone 專案
git clone git@github.com:tzuweii/kakalove-coffee-group-buy.git
```

---

## 日常使用

```bash
# 開始工作前（必做）
git pull

# 查看狀態
git status

# 提交變更
git add .
git commit -m "描述這次修改的內容"

# 推上 GitHub
git push

# 查看歷史
git log --oneline
```
