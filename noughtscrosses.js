const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

var table = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
var player = "O";

let i = 0;
let makeMove = function (number) {
    console.log("player: " + player);
    if(player == "X"){
      player = "O";
    }else{
      player = "X";
    }
    table[number - 1] = player;
    i = i + 1;
    console.log(i);
    if (i <= 50){
      playNoughts()
    }
  }
  
  function playNoughts() {
    console.log(table);
    readline.question('Please enter your square?', makeMove);
};

playNoughts()