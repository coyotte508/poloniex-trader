$(function() {
  // $('#glform').submit(function(e){
  //   console.log("submitting");
  //   console.log($('#glform').serialize());

  //   e.preventDefault();
  //   $.ajax({
  //     url:'/glconf',
  //     type:'post',
  //     data:$('#glform').serialize(),
  //     success:function(){
  //       //whatever you wanna do after the form is successfully submitted
  //     },
  //     error: function(xhr) {
  //       alert(JSON.stringify(xhr));
  //     }
  //   });
  // });

   $("#delete").submit(function(e){
      e.preventDefault();
      if (confirm("Click OK to continue?")){
         this.submit();
      }
   });
});