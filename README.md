# Converting Node CLI Programs to Web Server Applications 

The [noughtscrosses.js](noughtscrosses.js) file is currently a (very basic) command line program. You can run it with:

`node noughtscrosses.js` 

Now that we know how to program Node.js servers (using Express), we should be able to convert it into something that can be played in a web browser.

* Using the Express techniques from the previous lab to make a website that allows users to play noughts and crosses.
  * You might start by making it as a static website (where the user needs to refresh between moves)
  * Then try extending it by adding AJAX requests that change the page contents when a move is made
  * Maybe you can open two browser windows and play as two different players?
    * How about on two different computers?
    * How will you know when the other person has made a move? Maybe another technique from the web lecture might help?

* How would you make it support multiple games at once?

* How do you think it would scale?

* Can you think of other games that might cause more complex scaling issues?

* What other features would be important to implement? How could this be achieved? Try implementing some of these ideas# epic-noughts-and-crosses
