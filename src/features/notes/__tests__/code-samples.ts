/**
 * What the code-block language detector is held to: code the way students write
 * it in notes, and text that only looks like code.
 *
 * Most rounds of these were written fresh and scored before the detector was
 * adjusted for them, so a new sample that fails is worth the same care: fix it
 * with something true about the language, not a pattern that fits this one text.
 */
import type { CodeLanguage } from '../code-languages'

export interface CodeSample {
  name: string
  code: string
}

/** Code, by the language it should be detected as. */
export const CODE_SAMPLES: Partial<Record<CodeLanguage, CodeSample[]>> = {
  bash: [
    { name: 'shebang loop', code: `#!/bin/bash
for file in *.txt; do
  echo "Processing $file"
done` },
    { name: 'if test', code: `if [ -f "notes.md" ]; then
  cp notes.md backup/
else
  echo "No notes yet"
fi` },
    { name: 'commands', code: `cd ~/projects/studentos
npm install
git status` },
    { name: 'env shebang', code: `#!/usr/bin/env bash
set -e
echo "Deploying..."` },
    { name: 'export path', code: `export PATH="$HOME/bin:$PATH"
source ~/.bashrc` },
    { name: 'while read', code: `while read -r line; do
  echo "$line"
done < notes.txt` },
    { name: 'brace range loop', code: `for i in {1..5}; do
  echo "Run $i"
done` },
    { name: 'venv setup', code: `python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt` },
    { name: 'mkdir cp', code: `mkdir -p backups && cp *.md backups/` },
    { name: 'for do done', code: `for f in *.txt; do
  echo "$f"
done` },
    { name: 'git commands', code: `git add .
git commit -m "notes"
git push` },
  ],
  c: [
    { name: 'stdio main', code: `#include <stdio.h>

int main(void) {
    int x = 42;
    printf("%d\\n", x);
    return 0;
}` },
    { name: 'struct + malloc', code: `#include <stdlib.h>

struct Node {
    int value;
    struct Node *next;
};

struct Node *make_node(int value) {
    struct Node *node = malloc(sizeof(struct Node));
    node->value = value;
    node->next = NULL;
    return node;
}` },
    { name: 'scanf loop', code: `#include <stdio.h>

int main() {
    int n;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        printf("%d\\n", i);
    }
    return 0;
}` },
    { name: 'pointers', code: `int x = 10;
int *p = &x;
*p = 20;
printf("%d", x);` },
    { name: 'define array', code: `#include <stdio.h>
#define MAX 10

int arr[MAX];` },
    { name: 'swap pointers', code: `void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}` },
    { name: 'char array scanf', code: `char name[20];
printf("Name: ");
scanf("%s", name);` },
    { name: 'struct point', code: `struct Point {
    int x;
    int y;
};

struct Point p = {1, 2};
printf("%d %d\\n", p.x, p.y);` },
    { name: 'array loop printf', code: `int arr[5] = {1, 2, 3, 4, 5};
for (int i = 0; i < 5; i++) {
    printf("%d ", arr[i]);
}` },
  ],
  cpp: [
    { name: 'iostream cout', code: `#include <iostream>

int main() {
    std::cout << "Hello, world" << std::endl;
    return 0;
}` },
    { name: 'vector + class', code: `#include <vector>
#include <string>

class Stack {
public:
    void push(int value) { items.push_back(value); }
    int pop() { int top = items.back(); items.pop_back(); return top; }
private:
    std::vector<int> items;
};` },
    { name: 'bits using namespace', code: `#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v = {3, 1, 2};
    sort(v.begin(), v.end());
    cout << v[0] << endl;
}` },
    { name: 'abstract class', code: `class Shape {
public:
    virtual double area() const = 0;
    virtual ~Shape() = default;
};` },
    { name: 'cin cout', code: `#include <iostream>
using namespace std;

int main() {
    string name;
    cin >> name;
    cout << "Hi " << name;
}` },
    { name: 'std map', code: `std::map<std::string, int> ages;
ages["Ada"] = 36;` },
    { name: 'range for auto', code: `for (auto& item : items) {
    std::cout << item << '\\n';
}` },
    { name: 'vector sort', code: `std::vector<int> v;
v.push_back(3);
std::sort(v.begin(), v.end());` },
    { name: 'dog class', code: `class Dog {
public:
    void bark() { cout << "Woof"; }
};` },
  ],
  csharp: [
    { name: 'console hello', code: `using System;

namespace Hello
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello, world");
        }
    }
}` },
    { name: 'properties', code: `public class Student
{
    public string Name { get; set; }
    public int Age { get; set; }

    public override string ToString() => $"{Name} ({Age})";
}` },
    { name: 'list foreach', code: `var numbers = new List<int> { 1, 2, 3 };
foreach (var n in numbers)
{
    Console.WriteLine(n);
}` },
    { name: 'constructor', code: `public class Student
{
    public string Name { get; }

    public Student(string name)
    {
        Name = name;
    }
}` },
    { name: 'foreach int', code: `int[] scores = { 90, 80 };
foreach (int s in scores)
{
    Console.WriteLine(s);
}` },
    { name: 'async task', code: `public async Task<string> GetNameAsync()
{
    await Task.Delay(100);
    return "Ada";
}` },
    { name: 'readline interpolate', code: `string name = Console.ReadLine();
Console.WriteLine($"Hi {name}");` },
    { name: 'list foreach 2', code: `List<int> nums = new List<int> { 1, 2, 3 };
foreach (int n in nums)
{
    Console.WriteLine(n);
}` },
  ],
  css: [
    { name: 'rules', code: `.card {
  padding: 1rem;
  border-radius: 8px;
  background-color: #f8fafc;
}` },
    { name: 'media query', code: `@media (max-width: 600px) {
  nav a:hover {
    color: rgb(37, 99, 235);
  }
}` },
    { name: 'body', code: `body {
  margin: 0;
  font-family: system-ui, sans-serif;
}` },
    { name: 'hover', code: `.btn:hover {
  transform: scale(1.05);
}` },
    { name: 'flex', code: `.container {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}` },
    { name: 'h1 hex', code: `h1 {
  font-size: 2rem;
  color: #333;
}` },
    { name: 'universal', code: `* {
  box-sizing: border-box;
}` },
    { name: 'link underline', code: `a {
  text-decoration: none;
}` },
    { name: 'flex container', code: `.container {
  display: flex;
  gap: 1rem;
}` },
  ],
  go: [
    { name: 'main fmt', code: `package main

import "fmt"

func main() {
    fmt.Println("Hello, world")
}` },
    { name: 'struct + receiver', code: `type Rect struct {
    Width, Height float64
}

func (r Rect) Area() float64 {
    return r.Width * r.Height
}` },
    { name: 'range', code: `nums := []int{4, 8, 15}
for i, v := range nums {
    fmt.Println(i, v)
}` },
    { name: 'err nil', code: `data, err := os.ReadFile("notes.txt")
if err != nil {
    return err
}` },
    { name: 'typed func', code: `func add(a int, b int) int {
	return a + b
}` },
    { name: 'grouped imports', code: `package main

import (
	"fmt"
	"strings"
)

func main() {
	fmt.Println(strings.ToUpper("go"))
}` },
    { name: 'var printf', code: `var count int = 0
count++
fmt.Printf("%d\\n", count)` },
    { name: 'for range', code: `for i, v := range items {
    fmt.Println(i, v)
}` },
    { name: 'slice append', code: `nums := []int{1, 2, 3}
nums = append(nums, 4)` },
  ],
  html: [
    { name: 'document', code: `<!DOCTYPE html>
<html>
  <body>
    <h1>My notes</h1>
    <p class="intro">Hello</p>
  </body>
</html>` },
    { name: 'fragment', code: `<div class="card">
  <img src="photo.png" alt="Me">
  <a href="/about">About</a>
</div>` },
    { name: 'form', code: `<form action="/login" method="post">
  <input type="email" name="email">
  <button type="submit">Sign in</button>
</form>` },
    { name: 'one-liner heading', code: `<h1>Title</h1>` },
    { name: 'list', code: `<ul>
  <li>Maths</li>
  <li>Physics</li>
</ul>` },
    { name: 'nav comment', code: `<!-- navigation -->
<nav>
  <a href="/">Home</a>
</nav>` },
    { name: 'inline strong', code: `<p>Hello <strong>world</strong></p>` },
    { name: 'login form', code: `<form action="/login">
  <input type="text" name="user">
  <button>Log in</button>
</form>` },
  ],
  java: [
    { name: 'reference Box class', code: `public class Box {
    private Object value;

    public void set(Object value) {
        this.value = value;
    }

    public Object get() {
        return value;
    }
}` },
    { name: 'hello main', code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, world");
    }
}` },
    { name: 'arraylist loop', code: `import java.util.ArrayList;
import java.util.List;

List<String> names = new ArrayList<>();
names.add("Ada");
for (String name : names) {
    System.out.println(name.toUpperCase());
}` },
    { name: 'one-liner println', code: `System.out.println("hello");` },
    { name: 'scanner', code: `import java.util.Scanner;

Scanner input = new Scanner(System.in);
System.out.print("Enter a number: ");
int n = input.nextInt();` },
    { name: 'recursion', code: `public static int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}` },
    { name: 'interface', code: `public interface Shape {
    double area();
    double perimeter();
}` },
    { name: 'array total', code: `int[] marks = {70, 80, 90};
int total = 0;
for (int m : marks) {
    total += m;
}
System.out.println(total / marks.length);` },
    { name: 'extends override', code: `class Dog extends Animal {
    @Override
    void speak() {
        System.out.println("Woof");
    }
}` },
    { name: 'try catch', code: `try {
    int x = Integer.parseInt(input);
} catch (NumberFormatException e) {
    e.printStackTrace();
}` },
    { name: 'string equals', code: `String s = "hello";
if (s.equals("hello")) {
    System.out.println(s.length());
}` },
    { name: 'student constructor', code: `public class Student {
    private String name;

    public Student(String name) {
        this.name = name;
    }
}` },
    { name: 'for sum println', code: `int sum = 0;
for (int i = 1; i <= 10; i++) {
    sum += i;
}
System.out.println(sum);` },
    { name: 'shape interface', code: `interface Shape {
    double area();
}` },
  ],
  javascript: [
    { name: 'arrow + console', code: `const add = (a, b) => a + b;
console.log(add(2, 3));` },
    { name: 'dom + fetch', code: `const button = document.querySelector('#load');

button.addEventListener('click', async () => {
  const response = await fetch('/api/notes');
  const notes = await response.json();
  notes.forEach((note) => console.log(note.title));
});` },
    { name: 'function + array methods', code: `function average(numbers) {
  const total = numbers.reduce((sum, n) => sum + n, 0);
  return total / numbers.length;
}

let scores = [72, 85, 90];
console.log(average(scores));` },
    { name: 'one-liner console.log', code: `console.log("hello");` },
    { name: 'class constructor', code: `class Animal {
  constructor(name) {
    this.name = name;
  }

  speak() {
    return \`\${this.name} makes a sound.\`;
  }
}` },
    { name: 'module exports', code: `function add(a, b) {
  return a + b;
}

module.exports = { add };` },
    { name: 'setTimeout', code: `setTimeout(() => {
  alert('Time is up!');
}, 1000);` },
    { name: 'jsx component', code: `export default function App() {
  return <h1>Hello</h1>;
}` },
    { name: 'map doubled', code: `const nums = [1, 2, 3];
const doubled = nums.map(n => n * 2);
console.log(doubled);` },
    { name: 'onclick counter', code: `let count = 0;
document.getElementById("btn").onclick = function () {
  count++;
};` },
    { name: 'async fetch fn', code: `async function getUser(id) {
  const res = await fetch("/users/" + id);
  return res.json();
}` },
    { name: 'object literal method', code: `const person = { name: "Ada", greet() { return "Hi"; } };` },
    { name: 'fetch then', code: `fetch("/api/notes")
  .then((res) => res.json())
  .then((data) => console.log(data));` },
    { name: 'counter class', code: `class Counter {
  constructor() {
    this.count = 0;
  }
  increment() {
    this.count++;
  }
}` },
    { name: 'arrow add', code: `const add = (a, b) => a + b;` },
  ],
  json: [
    { name: 'object', code: `{
  "name": "Ada",
  "age": 36,
  "skills": ["maths", "engines"]
}` },
    { name: 'array of objects', code: `[
  { "code": "CS101", "credits": 12 },
  { "code": "MA102", "credits": 16 }
]` },
    { name: 'nested config', code: `{"compilerOptions": {"strict": true, "target": "ES2022"}}` },
    { name: 'modules', code: `{"modules": [{"code": "CS101"}], "semester": 2}` },
    { name: 'number array', code: `[1, 2, 3]` },
    { name: 'package', code: `{
  "name": "studentos",
  "version": "1.0.0"
}` },
  ],
  kotlin: [
    { name: 'main val', code: `fun main() {
    val names = listOf("Ada", "Grace")
    for (name in names) {
        println("Hello, $name")
    }
}` },
    { name: 'data class', code: `data class Student(val name: String, var age: Int)

fun Student.greet(): String = "Hi, I'm $name"` },
    { name: 'when', code: `when (grade) {
    in 90..100 -> println("A")
    in 80..89 -> println("B")
    else -> println("Keep going")
}` },
    { name: 'class fun', code: `class Person(val name: String) {
    fun greet() = println("Hi, $name")
}` },
    { name: 'filter it', code: `val numbers = listOf(1, 2, 3)
val evens = numbers.filter { it % 2 == 0 }
println(evens)` },
    { name: 'isAdult', code: `fun isAdult(age: Int): Boolean {
    return age >= 18
}` },
    { name: 'person class', code: `class Person(val name: String, var age: Int)` },
  ],
  matlab: [
    { name: 'linspace plot', code: `x = linspace(0, 2*pi, 100);
y = sin(x);
plot(x, y);
title('Sine wave');` },
    { name: 'for loop end', code: `total = 0;
for i = 1:10
    total = total + i^2;
end
disp(total)` },
    { name: 'function file', code: `function r = area(radius)
    r = pi * radius.^2;
end` },
    { name: 'matrix transpose', code: `A = [1 2; 3 4];
B = A';
C = A * B;` },
    { name: 'if elseif', code: `if x > 0
    disp('positive')
elseif x < 0
    disp('negative')
else
    disp('zero')
end` },
    { name: 'fprintf', code: `x = 42;
fprintf('Value: %d\\n', x);` },
    { name: 'det rand', code: `A = rand(3);
detA = det(A);
disp(detA)` },
    { name: 'range pow plot', code: `x = 0:0.1:1;
y = x.^2;
plot(x, y)` },
    { name: 'vector fprintf', code: `v = [1, 2, 3];
m = mean(v);
fprintf('%.2f\\n', m);` },
    { name: 'plot sine', code: `x = 0:0.1:2*pi;
y = sin(x);
plot(x, y)` },
    { name: 'if elseif 2', code: `if x > 0
    disp('positive')
elseif x < 0
    disp('negative')
end` },
  ],
  php: [
    { name: 'echo tags', code: `<?php
$name = "Ada";
echo "Hello, " . $name;
?>` },
    { name: 'function vars', code: `<?php
function average(array $numbers): float {
    return array_sum($numbers) / count($numbers);
}

$scores = [72, 85, 90];
echo average($scores);` },
    { name: 'template', code: `<ul>
<?php foreach ($items as $item): ?>
  <li><?= $item ?></li>
<?php endforeach; ?>
</ul>` },
    { name: 'class no tag', code: `class User {
    public $name;

    function __construct($name) {
        $this->name = $name;
    }
}` },
    { name: 'foreach assoc', code: `<?php
$marks = ["Ada" => 91];
foreach ($marks as $name => $mark) {
    echo "$name: $mark\\n";
}` },
    { name: 'foreach price', code: `$total = 0;
foreach ($items as $item) {
    $total += $item['price'];
}` },
    { name: 'echo tags 2', code: `<?php
echo "Hello, World!";
?>` },
    { name: 'add function', code: `function add($a, $b) {
    return $a + $b;
}` },
  ],
  python: [
    { name: 'def + loop + fstring', code: `def average(numbers):
    total = sum(numbers)
    return total / len(numbers)

scores = [72, 85, 90]
for score in scores:
    print(f"Score: {score}")` },
    { name: 'class init', code: `class Student:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def greet(self):
        return "Hi, " + self.name` },
    { name: 'imports + comprehension', code: `import numpy as np
import matplotlib.pyplot as plt

squares = [x ** 2 for x in range(10) if x % 2 == 0]
plt.plot(np.array(squares))
plt.show()` },
    { name: 'one-liner print', code: `print("hello")` },
    { name: 'while input', code: `total = 0
while True:
    value = input("Number (or q): ")
    if value == "q":
        break
    total += int(value)
print(total)` },
    { name: 'try except', code: `try:
    result = 10 / 0
except ZeroDivisionError as error:
    print("Cannot divide:", error)` },
    { name: 'dict comp + lambda', code: `grades = {"Ada": 91, "Alan": 78}
passed = {name: mark for name, mark in grades.items() if mark >= 50}
ranked = sorted(grades, key=lambda name: grades[name], reverse=True)` },
    { name: 'one-liner range loop', code: `for i in range(10): print(i)` },
    { name: 'input greeting', code: `name = input("What's your name? ")
print("Hello " + name)` },
    { name: 'random guess', code: `import random

secret = random.randint(1, 10)
guess = int(input("Guess: "))
if guess == secret:
    print("Correct!")` },
    { name: 'with open', code: `with open("notes.txt") as f:
    for line in f:
        print(line.strip())` },
    { name: 'sort print', code: `numbers = [3, 1, 2]
numbers.sort()
print(numbers)` },
    { name: 'main guard', code: `def main():
    pass

if __name__ == "__main__":
    main()` },
    { name: 'list comprehension', code: `squares = [x**2 for x in range(10)]
print(squares)` },
    { name: 'dict items loop', code: `ages = {"Ann": 20, "Ben": 22}
for name, age in ages.items():
    print(name, age)` },
    { name: 'while count', code: `count = 0
while count < 5:
    count += 1` },
    { name: 'try except 2', code: `try:
    x = int(input())
except ValueError:
    print("Not a number")` },
  ],
  r: [
    { name: 'vector mean', code: `x <- c(72, 85, 90)
mean(x)
summary(x)` },
    { name: 'ggplot data.frame', code: `library(ggplot2)

df <- data.frame(week = 1:5, hours = c(4, 6, 5, 8, 7))
ggplot(df, aes(x = week, y = hours)) + geom_line()` },
    { name: 'for in range', code: `for (i in 1:10) {
  print(i)
}` },
    { name: 'function', code: `add <- function(x, y) {
  return(x + y)
}` },
    { name: 'df dollar', code: `students$average <- rowMeans(students[, 2:4])
head(students)` },
    { name: 'hist', code: `scores <- c(70, 85, 90)
hist(scores)` },
    { name: 'lm model', code: `model <- lm(y ~ x, data = df)
summary(model)` },
    { name: 'mean c', code: `mean(c(1, 2, 3))` },
    { name: 'ggplot', code: `library(ggplot2)
ggplot(df, aes(x = age, y = score)) + geom_point()` },
    { name: 'vector mean 2', code: `scores <- c(70, 85, 90)
mean(scores)` },
  ],
  sql: [
    { name: 'select join', code: `SELECT s.name, AVG(g.mark) AS average
FROM students s
JOIN grades g ON g.student_id = s.id
GROUP BY s.name
ORDER BY average DESC;` },
    { name: 'create table', code: `CREATE TABLE modules (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  credits INT DEFAULT 12
);` },
    { name: 'insert', code: `INSERT INTO students (name, age) VALUES ('Ada', 20);` },
    { name: 'update', code: `UPDATE grades SET mark = 75 WHERE id = 3;` },
    { name: 'lowercase select', code: `select * from users where active = true;` },
    { name: 'one-liner select', code: `SELECT * FROM users;` },
    { name: 'having', code: `SELECT name, COUNT(*) FROM enrolments GROUP BY name HAVING COUNT(*) > 2;` },
    { name: 'delete interval', code: `DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '30 days';` },
    { name: 'count where', code: `SELECT COUNT(*) FROM students WHERE year = 2;` },
    { name: 'join', code: `SELECT s.name, c.title
FROM students s
JOIN courses c ON s.course_id = c.id;` },
    { name: 'lowercase insert', code: `insert into students (name, age) values ('Ann', 20);` },
  ],
  typescript: [
    { name: 'interface + typed fn', code: `interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  return "Hello, " + user.name;
}` },
    { name: 'generic + type alias', code: `type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function first<T>(items: T[]): T | undefined {
  return items[0];
}` },
    { name: 'typed array + fn', code: `const scores: number[] = [72, 85, 90];

function sum(a: number, b: number): number {
  return a + b;
}` },
    { name: 'enum + typed let', code: `enum Color {
  Red,
  Green,
  Blue,
}
let favourite: Color = Color.Green;` },
    { name: 'class private typed', code: `export class TodoService {
  private todos: string[] = [];

  add(todo: string): void {
    this.todos.push(todo);
  }
}` },
    { name: 'inline object type', code: `const user: { name: string; age: number } = { name: "Ada", age: 36 };` },
    { name: 'isEven', code: `function isEven(n: number): boolean {
  return n % 2 === 0;
}` },
    { name: 'typed arrow', code: `const greet = (name: string): string => \`Hello \${name}\`;` },
    { name: 'generic interface', code: `interface ApiResponse<T> {
  data: T;
  error?: string;
}` },
  ],
}

/** Not code. Colouring these as anything would be a wrong guess on screen. */
export const NOT_CODE_SAMPLES: CodeSample[] = [
  { name: 'one-liner x = 1', code: `x = 1` },
  { name: 'prose sentence', code: `Remember to revise chapter 4 before the test on Friday.` },
  { name: 'prose list', code: `Things to bring:
- calculator
- student card
- two pens` },
  { name: 'prose tcp', code: `Lecture 5 summary: the TCP handshake has three steps.` },
  { name: 'prose q&a', code: `Q: What is polymorphism?
A: Many forms.` },
  { name: 'maths', code: `f(x) = x^2 + 3x - 4` },
  { name: 'todo line', code: `TODO: finish the essay; submit by Friday` },
  { name: 'prose exam', code: `Remember: the exam covers chapters 1 to 5.` },
  { name: 'pseudo-code', code: `IF mark >= 50 THEN pass ELSE fail` },
  { name: 'prose photosynthesis', code: `Chapter 3: Photosynthesis converts light energy into chemical energy.` },
  { name: 'numbered steps', code: `1. Read the brief
2. Draft an outline
3. Write the intro` },
  { name: 'equation', code: `E = mc^2` },
  { name: 'meeting note', code: `Meeting at 14:00 in room B12; bring laptop.` },
  { name: 'url', code: `https://example.com/docs?id=5` },
  { name: 'email header', code: `From: tutor@uni.ac.za
Subject: Assignment 2` },
  { name: 'prose select from', code: `select one option from the dropdown` },
  { name: 'pseudo-code 2', code: `IF score > 50 THEN
  PRINT "Pass"
ENDIF` },
  { name: 'program output', code: `Hello, World!` },
  { name: 'to-do prose', code: `Buy milk, eggs and bread
Call mom at 5pm` },
  { name: 'create table prose', code: `create table of contents for the report` },
  { name: 'derivative', code: `f(x) = 3x^2 + 2x - 1
f'(x) = 6x + 2` },
  { name: 'build log', code: `Compiling...
Build succeeded in 2.3s` },
  { name: 'make sure prose', code: `make sure to review chapter 4
make flashcards for key terms` },
  { name: 'chemistry', code: `2H2 + O2 -> 2H2O` },
]
