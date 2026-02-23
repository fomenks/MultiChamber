# MultiChamber - Спецификация проекта

## Содержание

1. [Обзор проекта](#1-обзор-проекта)
2. [Архитектура системы](#2-архитектура-системы)
3. [Функциональные требования](#3-функциональные-требования)
4. [Техническая спецификация](#4-техническая-спецификация)
5. [API Endpoints](#5-api-endpoints)
6. [Структура базы данных и хранилища](#6-структура-базы-данных-и-хранилища)
7. [Компоненты пользовательского интерфейса](#7-компоненты-пользовательского-интерфейса)
8. [Безопасность](#8-безопасность)
9. [Конфигурация и развёртывание](#9-конфигурация-и-развёртывание)
10. [Скрипты и инициализация](#10-скрипты-и-инициализация)

---

## 1. Обзор проекта

### Название проекта
**MultiChamber** - многопользовательская система OpenChamber на базе Ubuntu 24.04 LTS с контейнеризацией Docker.

### Назначение
Система предоставляет изолированные рабочие пространства OpenChamber для каждого пользователя с централизованным веб-интерфейсом для аутентификации, управления пользователями и мониторинга.

### Ключевые возможности
- **Многопользовательская поддержка**: Каждый пользователь получает собственную учётную запись Unix с домашним каталогом
- **Изолированные экземпляры OpenChamber**: Каждый пользователь имеет собственный изолированный экземпляр OpenChamber
- **HTTP-аутентификация**: Веб-интерфейс для входа с использованием JWT-токенов
- **Автоматическое управление портами**: Динамическое выделение портов для экземпляров OpenChamber
- **Панель администратора**: Управление пользователями, мониторинг системы, контроль экземпляров
- **Проксирование трафика**: Автоматическая маршрутизация трафика к экземпляру OpenChamber пользователя
- **Стандартная Unix-аутентификация**: Использует /etc/passwd и /etc/shadow

---

## 2. Архитектура системы

### Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           MultiChamber HTTP Server (Port 8080)      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │  Login   │  │  Admin   │  │  Proxy Service   │  │   │
│  │  │  Page    │  │  Panel   │  │                  │  │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│          ┌───────────────┼───────────────┐                 │
│          ▼               ▼               ▼                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ OpenChamber  │ │ OpenChamber  │ │ OpenChamber  │       │
│  │   User 1     │ │   User 2     │ │   User N     │       │
│  │ (Port 10001) │ │ (Port 10002) │ │ (Port 1000N) │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Unix User System (/etc/passwd)         │    │
│  │  - admin (administrator)                         │    │
│  │  - user1, user2, ... (regular users)             │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Компоненты системы

#### Серверная часть (server/)
Express.js сервер на TypeScript, обрабатывающий:
- Аутентификацию пользователей (JWT)
- Управление пользователями Unix
- Управление экземплярами OpenChamber
- Проксирование запросов к экземплярам OpenChamber
- API для администрирования

#### Клиентская часть (ui/)
React-приложение на TypeScript с:
- Страница входа
- Dashboard пользователя
- Панель администратора
- Управление состоянием через Zustand
- Запросы данных через React Query

#### Контейнеризация (Docker)
- Docker-образ на базе Ubuntu 24.04
- Docker Compose для оркестрации
- Привилегированный режим для управления пользователями

---

## 3. Функциональные требования

### 3.1 Аутентификация и авторизация

#### Вход пользователя
- Пользователь вводит username и password
- Сервер проверяет учётные данные через Unix PAM (Python spwd)
- При успешной аутентификации генерируется JWT-токен
- Токен сохраняется в cookie и localStorage
- Автоматически запускается экземпляр OpenChamber

#### JWT-токены
- Секретный ключ: настраивается через переменную окружения `JWT_SECRET`
- Время жизни: 24 часа
- Содержит: username, isAdmin

#### Сессии
- Токен передаётся через заголовок Authorization или cookie
- Проверка токена при каждом запросе к защищённым endpoints
- Верификация существования пользователя в системе

### 3.2 Управление пользователями

#### Создание пользователя (только админ)
- Параметры: username, password, isAdmin (опционально)
- Валидация имени пользователя (regex: `^[a-z_][a-z0-9_-]*$`)
- Создание Unix-пользователя через `useradd`
- Установка пароля через `chpasswd`
- Создание домашнего каталога: `/home/users/<username>`
- Настройка OpenChamber в домашнем каталоге

#### Удаление пользователя (только админ)
- Остановка экземпляра OpenChamber
- Удаление Unix-пользователя через `userdel -r`
- Удаление данных пользователя

#### Изменение пароля
- Требуется текущий пароль для верификации
- Используется команда `chpasswd`

### 3.3 Управление экземплярами OpenChamber

#### Запуск экземпляра
- Динамический поиск свободного порта (диапазон 10000-20000)
- Создание workspace-каталога
- Запуск процесса OpenChamber от имени пользователя
- Ожидание готовности (health check)
- Сохранение маппинга портов в файл

#### Остановка экземпляра
- Отправка SIGTERM процессу
- Принудительный SIGKILL через 10 секунд
- Очистка маппинга портов

#### Проксирование
- Маршрут `/*` проксирует к экземпляру пользователя
- Перезапись URL в HTML-ответах
- Передача заголовков X-MultiChamber-User и X-MultiChamber-Admin

### 3.4 Панель администратора

#### Мониторинг системы
- Uptime системы
- Использование памяти (всего/использовано/процент)
- Информация о CPU (количество ядер, load average)
- Список пользователей
- Активные экземпляры OpenChamber

#### Управление экземплярами
- Перезапуск экземпляра пользователя
- Остановка экземпляра пользователя

---

## 4. Техническая спецификация

### 4.1 Зависимости сервера

#### Основные зависимости
| Пакет | Версия | Назначение |
|-------|--------|------------|
| express | ^4.18.2 | Веб-фреймворк |
| jsonwebtoken | ^9.0.2 | JWT-аутентификация |
| bcryptjs | ^2.4.3 | Хеширование паролей |
| cookie-parser | ^1.4.6 | Парсинг cookies |
| cors | ^2.8.5 | CORS |
| helmet | ^7.1.0 | Безопасность заголовков |
| express-rate-limit | ^7.1.5 | Ограничение частоты запросов |
| express-http-proxy | ^2.1.2 | Проксирование HTTP |
| ws | ^8.14.2 | WebSocket |
| node-cron | ^3.0.3 | Планировщик задач |

#### Типы TypeScript
| Пакет | Версия |
|-------|--------|
| @types/node | ^20.10.4 |
| @types/express | ^4.17.21 |
| @types/jsonwebtoken | ^9.0.5 |

### 4.2 Зависимости клиента

#### Основные зависимости
| Пакет | Версия | Назначение |
|-------|--------|------------|
| react | ^18.2.0 | UI-фреймворк |
| react-dom | ^18.2.0 | React DOM |
| react-router-dom | ^6.20.1 | Маршрутизация |
| zustand | ^4.4.7 | Управление состоянием |
| @tanstack/react-query | ^5.13.4 | Запросы данных |
| axios | ^1.6.2 | HTTP-клиент |
| lucide-react | ^0.294.0 | Иконки |

#### UI-компоненты (Radix UI)
| Пакет | Назначение |
|-------|------------|
| @radix-ui/react-dialog | Модальные окна |
| @radix-ui/react-dropdown-menu | Выпадающие меню |
| @radix-ui/react-tooltip | Подсказки |
| @radix-ui/react-toast | Уведомления |
| @radix-ui/react-label | Метки форм |
| @radix-ui/react-slot | Компонент-слот |

#### Стилизация
| Пакет | Версия |
|-------|--------|
| tailwindcss | ^3.3.6 |
| tailwindcss-animate | ^1.0.7 |
| class-variance-authority | ^0.7.0 |
| clsx | ^2.0.0 |
| tailwind-merge | ^2.1.0 |

### 4.3 Структура проекта

```
MultiChamber/
├── Dockerfile                     # Docker-образ
├── docker-compose.yml             # Docker Compose конфигурация
├── package.json                   # Корневой package.json
├── README.md                      # Документация
├── LICENSE                        # Лицензия
├── scripts/
│   ├── init-system.sh             # Скрипт инициализации контейнера
│   └── start-openchamber.sh       # Скрипт запуска OpenChamber
├── server/                        # Серверная часть
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # Точка входа сервера
│       ├── routes/
│       │   ├── auth.ts            # Роуты аутентификации
│       │   ├── admin.ts           # Роуты администрирования
│       │   └── proxy.ts           # Проксирование OpenChamber
│       ├── services/
│       │   ├── userService.ts     # Управление пользователями
│       │   ├── openChamberService.ts  # Управление экземплярами
│       │   └── jwtService.ts      # JWT-операции
│       ├── middleware/
│       │   └── auth.ts            # Middleware аутентификации
│       └── types/
│           └── index.ts           # TypeScript-типы
└── ui/                            # Клиентская часть
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts             # Vite конфигурация
    ├── tailwind.config.js         # Tailwind конфигурация
    ├── postcss.config.js
    ├── index.html
    ├── public/
    │   └── vite.svg
    └── src/
        ├── main.tsx               # Точка входа React
        ├── App.tsx                # Главный компонент
        ├── index.css              # Глобальные стили
        ├── pages/
        │   ├── LoginPage.tsx      # Страница входа
        │   ├── DashboardPage.tsx  # Dashboard пользователя
        │   └── AdminPage.tsx      # Панель администратора
        ├── components/
        │   ├── Layout.tsx         # Компонент макета
        │   └── ui/                # UI-компоненты
        │       ├── button.tsx
        │       ├── input.tsx
        │       ├── card.tsx
        │       ├── table.tsx
        │       ├── dialog.tsx
        │       └── alert.tsx
        ├── stores/
        │   ├── authStore.ts       # Zustand store для auth
        │   └── adminStore.ts      # Zustand store для admin
        ├── lib/
        │   └── utils.ts           # Утилиты
        └── types/
            └── index.ts           # TypeScript-типы
```

---

## 5. API Endpoints

### 5.1 Аутентификация

#### POST /mc13/api/auth/login
Вход пользователя в систему.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "user": {
    "username": "string",
    "isAdmin": "boolean",
    "homeDir": "string"
  },
  "openChamberPort": "number"
}
```

#### POST /mc13/api/auth/logout
Выход пользователя из системы.

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

#### GET /mc13/api/auth/me
Получение информации о текущем пользователе.

**Response:**
```json
{
  "user": {
    "username": "string",
    "isAdmin": "boolean",
    "homeDir": "string"
  },
  "openChamberPort": "number | null"
}
```

#### POST /mc13/api/auth/change-password
Изменение пароля текущего пользователя.

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
}
```

### 5.2 Управление пользователями (только админ)

#### GET /mc13/api/auth/users
Получение списка всех пользователей.

**Response:**
```json
{
  "users": [
    {
      "username": "string",
      "isAdmin": "boolean",
      "homeDir": "string",
      "uid": "number"
    }
  ]
}
```

#### POST /mc13/api/auth/users
Создание нового пользователя.

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "isAdmin": "boolean (опционально)"
}
```

**Response:**
```json
{
  "user": {
    "username": "string",
    "isAdmin": "boolean",
    "homeDir": "string"
  }
}
```

#### DELETE /mc13/api/auth/users/:username
Удаление пользователя.

**Response:**
```json
{
  "message": "User deleted successfully"
}
```

### 5.3 Администрирование

#### GET /mc13/api/admin/status
Получение статуса системы.

**Response:**
```json
{
  "system": {
    "uptime": "number",
    "memory": {
      "total": "number",
      "free": "number",
      "used": "number",
      "percentage": "number"
    },
    "cpu": {
      "count": "number",
      "loadAvg": "number[]"
    },
    "platform": "string",
    "release": "string"
  },
  "users": {
    "total": "number",
    "list": [
      {
        "username": "string",
        "isAdmin": "boolean",
        "homeDir": "string"
      }
    ]
  },
  "openChamber": {
    "activeInstances": "number",
    "instances": [
      {
        "username": "string",
        "port": "number",
        "pid": "number",
        "startTime": "string",
        "status": "string"
      }
    ]
  }
}
```

#### POST /mc13/api/admin/restart-instance/:username
Перезапуск экземпляра OpenChamber для пользователя.

**Response:**
```json
{
  "message": "Instance restarted successfully",
  "instance": {
    "username": "string",
    "port": "number",
    "pid": "number",
    "status": "string"
  }
}
```

#### POST /mc13/api/admin/stop-instance/:username
Остановка экземпляра OpenChamber для пользователя.

**Response:**
```json
{
  "message": "Instance stopped successfully"
}
```

### 5.4 Прокси

#### GET /*
Проксирование запросов к экземпляру OpenChamber пользователя.

Требует аутентификации через JWT-токен.

---

## 6. Структура базы данных и хранилища

### 6.1 Unix-пользователи
Система использует стандартные Unix-учётные записи:
- Файл `/etc/passwd` - информация о пользователях
- Файл `/etc/shadow` - хеши паролей

### 6.2 Домашние каталоги
```
/home/users/
├── admin/
│   ├── .opencode/
│   └── workspace/
├── user1/
│   ├── .opencode/
│   └── workspace/
└── userN/
    ├── .opencode/
    └── workspace/
```

### 6.3 Маппинг портов
Файл: `/app/data/openchamber-ports.json`

```json
{
  "username1": {
    "port": 10001,
    "pid": 12345,
    "username": "username1",
    "startTime": "2024-01-01T00:00:00.000Z",
    "status": "running"
  }
}
```

### 6.4 Тома Docker
| Название | Назначение |
|----------|------------|
| user_data | Домашние каталоги пользователей (/home/users) |
| app_data | Данные приложения (маппинги портов) |

---

## 7. Компоненты пользовательского интерфейса

### 7.1 Страницы

#### LoginPage
- Форма входа с полями username и password
- Отображение ошибок аутентификации
- Загрузка во время входа

#### DashboardPage
- Приветствие пользователя
- Карточки с информацией:
  - Username и роль
  - Home Directory
  - OpenChamber Port
- Iframe с OpenChamber workspace
- Кнопка открытия в новой вкладке

#### AdminPage
- Статистика системы:
  - System Uptime
  - Memory Usage
  - Total Users
  - Active Instances
- Таблица пользователей с:
  - Username
  - Role (Admin/User)
  - Home Directory
  - Instance Status
  - Port
  - Actions (Play/Stop/Delete)
- Диалог создания пользователя

### 7.2 UI-компоненты
- Button - кнопки
- Input - поля ввода
- Card - карточки
- Table - таблицы
- Dialog - модальные окна
- Alert - уведомления

### 7.3 Навигация
- Header с логотипом MultiChamber
- Ссылки: Dashboard, Admin (только для админов)
- Отображение имени пользователя и роли
- Кнопка logout

---

## 8. Безопасность

### 8.1 Аутентификация
- JWT-токены с настраиваемым секретом
- Время жизни токена: 24 часа
- Хранение токена в httpOnly cookie и localStorage

### 8.2 Rate Limiting
- Общий лимит: 100 запросов за 15 минут
- Лимит на вход: 5 попыток за 15 минут

### 8.3 Заголовки безопасности (Helmet)
- Content Security Policy
- HSTS
- X-Frame-Options
- X-Content-Type-Options

### 8.4 CORS
- В production: только same-origin
- В development: localhost:3000, localhost:5173

### 8.5 Права доступа
- Привилегированный Docker-контейнер для управления пользователями
- Изоляция пользователей через Unix-учётные записи

### 8.6 Рекомендации по развёртыванию
1. Изменить пароли по умолчанию
2. Использовать HTTPS
3. Настроить firewall для портов 10000-20000
4. Регулярно обновлять зависимости

---

## 9. Конфигурация и развёртывание

### 9.1 Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| MC_ADMIN_PASSWD | Пароль администратора | admin123 |
| JWT_SECRET | Секретный ключ JWT | multichamber-secret-change-me |
| PORT | Порт HTTP-сервера | 8080 |
| NODE_ENV | Режим окружения | production |

### 9.2 Диапазоны портов

| Диапазон | Назначение |
|----------|------------|
| 8080 | MultiChamber HTTP server |
| 10000-20000 | OpenChamber instances |

### 9.3 Базовый путь

| Путь | Назначение |
|------|------------|
| /mc13/* | Статические файлы проекта (UI) |
| /mc13/api/* | API endpoints |
| /* | Прокси к OpenChamber |

### 9.4 Docker Compose конфигурация

```yaml
services:
  multichamber:
    build: .
    ports:
      - "8123:8080"
      - "10000-10100:10000-10100"
    environment:
      - MC_ADMIN_PASSWD=qwe321
      - NODE_ENV=production
      - PORT=8080
      - JWT_SECRET=multichamber-secret-production
    volumes:
      - user_data:/home/users
      - app_data:/app/data
    privileged: true
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
```

### 9.5 health
- Endpoint: /mc13/health
- Интервал: 30 секунд
- Таймаут: 10 секунд
- Повторные попытки: 3
- Начальный период: 40 секунд

---

## 10. Скрипты и инициализация

### 10.1 init-system.sh
Скрипт инициализации контейнера:
1. Создание администратора (если MC_ADMIN_PASSWD установлен)
2. Запуск OpenChamber в фоновом режиме
3. Запуск MultiChamber HTTP-сервера

### 10.2 start-openchamber.sh
Скрипт запуска OpenChamber для пользователя:
1. Определение порта из переменной окружения
2. Проверка занятости порта
3. Запуск OpenChamber из различных возможных расположений

---

## Версия и лицензия

- **Версия**: 1.0.0
- **Лицензия**: GNU AGPL
- **Базовая ОС**: Ubuntu 24.04 LTS
- **Node.js**: версия 20

---

## Ссылки

- Репозиторий: (указать URL репозитория)
- OpenChamber: https://github.com/anomalyco/opencode
